# Memex Phase 1 — Code Explanation

This document walks you through every file we added and what it does.

---

## 1. `.env.local` — your secret config

```
DATABASE_URL=postgresql://...
```

This file holds your Neon Postgres connection string. Next.js automatically loads
`.env.local` into `process.env` at runtime, so your app code can access
`process.env.DATABASE_URL` without any extra setup. It's gitignored so your
credentials never end up in version control.

---

## 2. `src/lib/schema.ts` — the database schema

This file defines your two database tables using Drizzle ORM's TypeScript API.
Instead of writing raw SQL `CREATE TABLE` statements, you describe tables as
JavaScript objects. Drizzle then uses these definitions for two things:

1. **Generating SQL migrations** — it diffs your schema against the database and
   produces the SQL needed to bring them in sync.
2. **Type-safe queries** — when you query `books` or `highlights` in your app code,
   TypeScript knows exactly what columns exist and what types they have.

### The `books` table

| Column       | Type        | Notes                                |
|--------------|-------------|--------------------------------------|
| `id`         | `serial`    | Auto-incrementing primary key        |
| `title`      | `text`      | The book's title                     |
| `author`     | `text`      | The book's author                    |
| `created_at` | `timestamp` | Defaults to `now()` on insert        |

### The `highlights` table

| Column       | Type           | Notes                                           |
|--------------|----------------|-------------------------------------------------|
| `id`         | `serial`       | Auto-incrementing primary key                   |
| `book_id`    | `integer`      | Foreign key pointing to `books.id`              |
| `content`    | `text`         | The highlighted text from the book              |
| `page`       | `text`         | Page or Kindle location (nullable)              |
| `embedding`  | `vector(1536)` | A 1536-dimension vector for semantic search (nullable, filled in Phase 2) |
| `created_at` | `timestamp`    | Defaults to `now()` on insert                   |

**Why `vector(1536)`?** In Phase 2, we'll use OpenAI or another embedding model
to turn each highlight into a list of 1536 numbers. This lets us find highlights
that are *semantically similar* — even if they share no words in common. Postgres
stores and queries these vectors using the pgvector extension, which Neon provides
out of the box.

**Why is `page` a `text` and not a number?** Kindle clippings sometimes report
page numbers, sometimes "location" ranges like `loc. 1234-1240`. Text handles both.

---

## 3. `src/lib/db.ts` — the database client

```ts
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

This file creates a single, reusable database connection:

1. `neon(...)` creates a Neon serverless SQL function. Unlike a traditional
   Postgres connection pool, this uses HTTP requests under the hood — perfect for
   serverless environments like Vercel where long-lived TCP connections are
   unreliable.
2. `drizzle(sql, { schema })` wraps that connection with Drizzle's query builder.
   Passing `{ schema }` enables Drizzle's "relational query" API (e.g., querying
   books with their highlights in one call).

The `!` after `process.env.DATABASE_URL` is a TypeScript non-null assertion — it
tells the compiler "trust me, this value exists." If it's actually missing at
runtime, Neon will throw a clear error.

---

## 4. `drizzle.config.ts` — migration configuration

```ts
config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

This tells Drizzle Kit (the CLI tool) three things:

- **Where to find your schema** — `./src/lib/schema.ts`
- **Where to output migration SQL files** — the `./drizzle` folder
- **How to connect to your database** — using the URL from `.env.local`

We explicitly load `.env.local` with `dotenv` because Drizzle Kit runs outside of
Next.js, so it doesn't get Next.js's automatic env loading.

### The two migration commands

- `npm run db:generate` — reads your schema, compares it to previous migrations,
  and creates a new `.sql` file with the diff. You should run this whenever you
  change `schema.ts`.
- `npm run db:push` — pushes your schema directly to the database (skipping
  migration files). Convenient during development.

---

## 5. `scripts/ingest.ts` — the Kindle highlight importer

This is a standalone script (not part of the web app) that you run from the
terminal:

```bash
npm run ingest path/to/My\ Clippings.txt
```

### What it does, step by step:

1. **Reads the file** — loads the entire `My Clippings.txt` into memory as a
   string.

2. **Splits into blocks** — Kindle separates each clipping with a line of
   `==========`. We split on that to get individual blocks.

3. **Parses each block** — each block has a predictable structure:
   - Line 1: `Book Title (Author Name)`
   - Line 2: metadata like `- Your Highlight on page 42 | location 600-612 | Added on ...`
   - Lines 3+: the actual highlighted text

   The parser uses regex to extract the author from parentheses, the page/location
   from the metadata line, and skips anything that isn't a highlight (Kindle also
   stores bookmarks and notes in the same file).

4. **Groups by book** — highlights are grouped by title + author so we can create
   one book record per book.

5. **Inserts into the database** — for each book, it checks if the book already
   exists (by title). If not, it creates one. Then it batch-inserts all the
   highlights for that book.

### Why a separate script and not an API route?

Ingesting data is a one-time batch operation, not something your web app needs to
handle on every request. A script is simpler, easier to debug, and doesn't need
authentication or file upload handling.

---

## 6. `src/app/api/books/route.ts` — the API endpoint

```ts
export async function GET() {
  const allBooks = await db.select().from(books);
  return Response.json(allBooks);
}
```

This is a Next.js **Route Handler**. By placing a `route.ts` file at
`src/app/api/books/`, Next.js automatically maps it to the URL `GET /api/books`.

- `db.select().from(books)` — Drizzle generates `SELECT * FROM books` and returns
  the rows as typed TypeScript objects.
- `Response.json(allBooks)` — the standard Web API way to return JSON. Next.js 16
  uses native Web `Request`/`Response` objects (no `res.json()` like Express).

---

## 7. `scripts/embed.ts` — the embedding generator

This is a standalone script (like `ingest.ts`) that you run once after importing
your highlights:

```bash
npm run embed
```

It reads every highlight that has no embedding yet, calls the Voyage AI API to
convert the text into a vector of 1536 numbers, and writes those numbers back into
the `highlights.embedding` column. The script is **idempotent** — running it twice
won't re-embed highlights that already have a vector; it simply skips them.

### What it does, step by step:

1. **Loads environment variables** — reads `VOYAGE_API_KEY` and `DATABASE_URL`
   from `.env.local`.

2. **Queries pending highlights** — runs
   `SELECT id, content FROM highlights WHERE embedding IS NULL`. Only highlights
   that haven't been processed yet are fetched.

3. **Batches in groups of 64** — the Voyage AI API accepts up to 128 texts per
   request; 64 is a conservative batch size that leaves headroom and is large
   enough to be efficient.

4. **Calls Voyage AI** — each batch is sent to the `voyage-large-2` model, which
   returns a 1536-dimensional vector for every input string. These vectors capture
   the semantic meaning of the text, not just its keywords.

5. **Saves the vectors** — each embedding is written back to the matching row with
   `UPDATE highlights SET embedding = [...] WHERE id = ?`.

6. **Handles errors without aborting** — if one batch or one update fails (e.g.,
   a network blip), the error is logged and the script continues with the next
   item. This way a partial failure doesn't wipe out progress already made.

7. **Pauses between batches** — a short delay (500 ms) between API calls keeps
   the script within Voyage AI's rate limits.

### Why 1536 dimensions?

`voyage-large-2` outputs 1536-dimensional vectors, which matches the
`vector(1536)` column defined in Phase 1. No schema migration is needed.

### What are embeddings for?

An embedding is a list of numbers that encodes the *meaning* of a piece of text.
Two highlights about similar concepts will have vectors that are close together
in this 1536-dimensional space, even if they share no words. In Phase 3 we'll use
Postgres's pgvector extension to find those nearest neighbors — that's how the
"unexpected connections" feature will work.

---

## 8. Phase 3 API routes — surfacing connections

### `src/app/api/highlights/route.ts` — `GET /api/highlights`

Returns every highlight in the database, joined with its book's title and author,
ordered alphabetically by book then by highlight id.

```json
[
  { "id": 1, "content": "...", "page": "p. 20", "bookId": 1,
    "bookTitle": "Thinking, Fast and Slow", "bookAuthor": "Daniel Kahneman" },
  ...
]
```

This endpoint is the entry point for browsing your library — pick any highlight
id from here to query its connections.

---

### `src/app/api/highlights/[id]/connections/route.ts` — `GET /api/highlights/:id/connections`

The core of Phase 3. Given a highlight id, it:

1. **Looks up the source highlight** — fetches its stored embedding vector and bookId.
2. **Runs a cosine distance query** — uses pgvector's `<=>` operator (via Drizzle's
   `cosineDistance()`) to rank every *other-book* highlight by semantic similarity.
3. **Returns the top 10 results**, each with a `similarity` score (0 = unrelated,
   1 = identical meaning).

```json
[
  {
    "id": 7, "content": "...", "page": "loc. 340", "bookId": 3,
    "bookTitle": "The Black Swan", "bookAuthor": "Nassim Taleb",
    "similarity": 0.8821
  },
  ...
]
```

**Why cosine distance?** Cosine similarity measures the angle between two vectors,
not their magnitude. This makes it robust to highlight length — a short sentence
and a long paragraph about the same idea will still score highly similar.

**Why cross-book only?** Same-book highlights share obvious context. Connections
across books are the surprising ones — a highlight from a psychology book resonating
with one from a physics book is the kind of unexpected link memex is built to find.

**Error cases:**
- `404` if the highlight id doesn't exist
- `400` if the highlight hasn't been embedded yet (run `npm run embed`)
- `400` if the id is not a valid integer

---

## 9. `src/app/page.tsx` — the UI

The main page is a **client component** (`"use client"`) that renders a three-panel
layout: Books | Highlights | Connections.

### How it works

On mount, it fetches both `/api/books` and `/api/highlights` in parallel and holds
them in React state. Highlights are filtered client-side by the selected book —
no extra API calls needed.

When the user clicks a highlight, it fetches `/api/highlights/:id/connections` and
shows the top 10 cross-book similar highlights in the right panel, each with a
`similarity` score (0–1).

### State

| State variable | Type | Purpose |
|---|---|---|
| `books` | `Book[]` | All books, shown in left panel |
| `highlights` | `Highlight[]` | All highlights, filtered by `selectedBookId` |
| `connections` | `Connection[]` | Similar highlights for the selected highlight |
| `selectedBookId` | `number \| null` | Which book is active |
| `selectedHighlightId` | `number \| null` | Which highlight is active |
| `loadingConnections` | `boolean` | Shows "Finding connections…" while fetching |

### Panel layout

```
┌──────────────┬──────────────────────┬──────────────────────┐
│  MEMEX       │  HIGHLIGHTS          │  CONNECTIONS         │
│──────────────│──────────────────────│──────────────────────│
│  Book A  ←   │  > Highlight 1       │  0.91  BookB         │
│  Book B      │    Highlight 2  ←    │  "Similar text..."   │
│  Book C      │    Highlight 3       │──────────────────────│
│              │                      │  0.87  BookC         │
│              │                      │  "Another text..."   │
└──────────────┴──────────────────────┴──────────────────────┘
```

The selected highlight in the middle panel gets a left indigo border as a visual
indicator. Connections in the right panel show the book name and similarity score.

---

## 10. `drizzle/0000_funny_black_bird.sql` — the generated migration

This is the raw SQL that Drizzle Kit generated from your schema. It contains:

- `CREATE TABLE "books" (...)` and `CREATE TABLE "highlights" (...)`
- The foreign key constraint linking `highlights.book_id` to `books.id`

You don't edit this file — it's auto-generated. It exists so you have a versioned
history of every schema change, which is essential when deploying to production
later.

---

## How it all fits together

```
My Clippings.txt
       |
       v
 scripts/ingest.ts  ──parses──>  books + highlights rows (embedding = NULL)
                                            |
                                            v
                                 scripts/embed.ts  ──calls──>  Voyage AI API
                                            |                        |
                                            |    embedding vectors   |
                                            v <─────────────────────
                                   highlights.embedding (vector(1536) filled)
                                            |
                                            v
                                      Neon Postgres
                                            ^
                                            |
  src/app/api/books/route.ts           ──queries──>  GET /api/books
  src/app/api/highlights/route.ts      ──queries──>  GET /api/highlights
  src/app/api/highlights/[id]/connections/route.ts
       └── cosineDistance(<=>)  ──queries──>  GET /api/highlights/:id/connections
                                                       ^
                                                       |
                                              Browser / curl / your future UI
```

### Quick start commands

```bash
# Push schema to your Neon database
npm run db:push

# Import your Kindle highlights
npm run ingest "path/to/My Clippings.txt"

# Generate embeddings for all highlights
npm run embed

# Start the dev server and hit the API
npm run dev
# Then visit:
#   http://localhost:3000/api/books
#   http://localhost:3000/api/highlights
#   http://localhost:3000/api/highlights/1/connections
```

---

## Bug Fix — `voyageai` SDK replaced with direct HTTP calls

The `voyageai` npm package (v0.2.1) has a broken ESM build: its `extended/index.mjs`
uses bare directory imports (`export * from "../api"`) which are not valid in Node.js
ESM. This caused the production build to fail with 5 "Module not found" errors
(`../api`, `../errors`, `../local`, `../Client`, `./ExtendedClient`) whenever any
route imported `voyageai`.

**Fix**: The SDK was replaced with a minimal direct HTTP wrapper (`src/lib/voyage.ts`)
that calls the Voyage AI REST endpoint directly:

```
POST https://api.voyageai.com/v1/embeddings
Authorization: Bearer {VOYAGE_API_KEY}
{ "model": "voyage-large-2", "input": ["text1", ...] }
```

`src/lib/embed.ts`, `src/lib/rag.ts`, and `scripts/embed.ts` now import
`voyageEmbed()` from `src/lib/voyage.ts` instead of `VoyageAIClient` from `voyageai`.
The `voyageai` package remains installed (it's in `package.json`) but is no longer
imported anywhere in the application.

The `voyageEmbed(texts, apiKey)` function returns `number[][]` (one vector per input),
matching the previous `result.data[i].embedding` access pattern.

---

## Disabling login for local dev — `AUTH_DISABLED` and `.env.example`

The app isn't deployed yet, so requiring GitHub/Google OAuth on every page is
just friction during local development. Rather than ripping out the auth
system, a single env flag now bypasses it while leaving everything else intact.

### `.env.example`

A new `.env.example` documents every environment variable the app reads
(`DATABASE_URL`, Auth.js OAuth credentials, `VOYAGE_API_KEY`,
`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `DIGEST_CRON_SECRET`, and the new
`AUTH_DISABLED`). Copy it to `.env.local` and fill in real values to run the
project.

### `src/lib/dev-auth.ts` — the bypass

```ts
export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function getCurrentUserId(): Promise<string | null> {
  if (AUTH_DISABLED) {
    await ensureDevUser(); // upserts a "Local Dev" row into `users`
    return DEV_USER_ID;
  }
  const session = await auth();
  return session?.user?.id ?? null;
}
```

Every `books`/`highlights` row has a `NOT NULL` foreign key to `users.id`, so
even in bypass mode a real (fixed) user row is needed — `ensureDevUser()`
creates one on first use and is a no-op afterwards.

### What changed

- `src/app/api/books/route.ts`, `highlights/route.ts`,
  `highlights/[id]/connections/route.ts`, `ingest/route.ts`, and `chat/route.ts`
  now call `getCurrentUserId()` instead of `auth()` directly. Behavior is
  unchanged when `AUTH_DISABLED` is unset/`false`.
- `src/components/NavBar.tsx` skips the session check and renders the nav
  (Memex/Add/Chat links) without the avatar/sign-out controls when disabled.
- `src/app/login/page.tsx` immediately redirects to `/` when disabled.
- `src/proxy.ts` — **important**: in this Next.js version, a `proxy.ts`
  exporting `proxy` + a `matcher` config IS the middleware (this version
  replaces the old `middleware.ts` convention — see `AGENTS.md`). It was
  actively redirecting every request without a session cookie to `/login`.
  Combined with the login page now redirecting back to `/`, this created an
  infinite redirect loop. Fixed by returning `NextResponse.next()`
  immediately when `AUTH_DISABLED=true`.

### Re-enabling real auth

Set `AUTH_DISABLED=false` (or remove it) from `.env.local` and configure the
Auth.js OAuth env vars — every route reverts to requiring a real session,
`/login` shows the GitHub/Google buttons again, and `src/proxy.ts` resumes
redirecting unauthenticated requests to `/login`.
