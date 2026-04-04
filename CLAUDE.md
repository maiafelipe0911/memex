@AGENTS.md

# Memex — Project Overview

Personal knowledge companion. Users add books and Kindle highlights; the system surfaces unexpected connections between highlights and generates thinking prompts.

## Stack

- **Framework**: Next.js 16 (App Router) — read `node_modules/next/dist/docs/` before touching routing or caching
- **Database**: Neon Postgres (serverless) with pgvector extension
- **ORM**: Drizzle ORM — schema in `src/lib/schema.ts`, client in `src/lib/db.ts`
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode)

## Key files

| File | Purpose |
|------|---------|
| `src/lib/schema.ts` | Drizzle schema — `books`, `highlights`, `users`, `accounts`, `sessions`, `verificationTokens` tables |
| `src/lib/db.ts` | Drizzle client via Neon serverless driver |
| `src/lib/auth.ts` | Auth.js v5 config — GitHub + Google OAuth, Drizzle adapter |
| `drizzle.config.ts` | Migration config, loads `.env.local` |
| `src/proxy.ts` | Auth guard — redirects unauthenticated requests to `/login` |
| `scripts/ingest.ts` | Kindle `My Clippings.txt` parser, run with `npm run ingest` |
| `scripts/embed.ts` | Voyage AI embedding script — generates `vector(1536)` for all unembedded highlights, run with `npm run embed` |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js catch-all route handler |
| `src/app/api/books/route.ts` | `GET /api/books` — returns user's books (requires auth) |
| `src/app/api/highlights/route.ts` | `GET /api/highlights` — returns user's highlights (requires auth) |
| `src/app/api/highlights/[id]/connections/route.ts` | `GET /api/highlights/:id/connections` — top 10 cross-book similar highlights (requires auth) |
| `src/app/login/page.tsx` | Login page with GitHub + Google OAuth buttons |
| `src/components/NavBar.tsx` | Server component nav bar showing user info + sign out |

## Database

- Connection string is in `.env.local` (gitignored)
- `VOYAGE_API_KEY` is in `.env.local` — required by `scripts/embed.ts`
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — required by Auth.js
- Schema changes: edit `src/lib/schema.ts` → `npm run db:generate` → `npm run db:push`
- `highlights.embedding` is `vector(1536)`, nullable — populated in Phase 2
- Auth tables managed by Auth.js via Drizzle adapter

## Useful scripts

```bash
npm run dev           # start dev server
npm run db:generate   # generate migration from schema changes
npm run db:push       # push schema to Neon
npm run db:studio     # open Drizzle Studio
npm run ingest <file> # import Kindle highlights
npm run embed         # generate embeddings for all highlights (idempotent)
```

## Roadmap

- **Phase 1** (done): DB schema, ingest script, `GET /api/books`
- **Phase 2** (done): Generate embeddings via Voyage AI (`voyage-large-2`), store in `highlights.embedding`
- **Phase 3** (done): Surface connections between highlights using vector similarity search
- **Phase 4** (done): UI — three-panel layout (Books | Highlights | Connections) in `src/app/page.tsx`
- **Phase 5.1** (done): Auth & multi-user — GitHub + Google OAuth, per-user data isolation, protected routes via `proxy.ts`
