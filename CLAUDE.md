@AGENTS.md

# Memex — Project Overview

Personal knowledge companion. Users add books and Kindle highlights; the system surfaces unexpected connections between highlights and generates thinking prompts.

## Important rule:

Whenever making changes to the code, remember to update this file (@CLAUDE.md) and expaling the changes in the @explanation.md

## Stack

- **Framework**: Next.js 16.2.9 (App Router) — read `node_modules/next/dist/docs/` before touching routing or caching
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
| `src/lib/dev-auth.ts` | `getCurrentUserId()` — session user id, or a fixed local dev user id when `AUTH_DISABLED=true` |
| `src/lib/ingest.ts` | Shared parsing functions — `parseKindleClippings`, `parsePdfText`, `parseManualText` |
| `src/lib/voyage.ts` | `voyageEmbed(texts, apiKey)` — direct HTTP wrapper for Voyage AI embeddings API (no SDK) |
| `src/lib/embed.ts` | `embedHighlightsByIds(ids)` — embeds specific highlights via Voyage AI (used by API routes) |
| `src/lib/rag.ts` | RAG utilities — `findRelevantHighlights`, `streamChatAnswer` via Claude |
| `src/lib/digest.ts` | Weekly digest builder (`buildDigestPairs`) and sender (`sendDigest`) via Resend |
| `drizzle.config.ts` | Migration config, loads `.env.local` |
| `src/proxy.ts` | Middleware (this Next.js version uses `proxy.ts`, not `middleware.ts`) — redirects unauthenticated requests to `/login`, bypassed when `AUTH_DISABLED=true` |
| `scripts/ingest.ts` | CLI Kindle importer — wraps `parseKindleClippings` from lib, run with `npm run ingest` |
| `scripts/embed.ts` | CLI embedding script — generates `vector(1536)` for all unembedded highlights, run with `npm run embed` |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js catch-all route handler |
| `src/app/api/books/route.ts` | `GET /api/books` — returns user's books (requires auth, unless `AUTH_DISABLED=true`) |
| `src/app/api/highlights/route.ts` | `GET /api/highlights` — returns user's highlights (requires auth, unless `AUTH_DISABLED=true`) |
| `src/app/api/highlights/[id]/connections/route.ts` | `GET /api/highlights/:id/connections` — top 10 cross-book similar highlights (requires auth, unless `AUTH_DISABLED=true`) |
| `src/app/api/ingest/route.ts` | `POST /api/ingest` — web ingestion endpoint (kindle/pdf/manual modes, auto-embeds) |
| `src/app/api/chat/route.ts` | `POST /api/chat` — streaming RAG chat endpoint |
| `src/app/api/cron/digest/route.ts` | `POST /api/cron/digest` — cron-triggered weekly digest, requires `DIGEST_CRON_SECRET` |
| `src/app/login/page.tsx` | Login page with GitHub + Google OAuth buttons |
| `src/app/add/page.tsx` | Add Highlights page — three-tab UI (Kindle / PDF / Manual) |
| `src/app/chat/page.tsx` | Chat page — streaming RAG conversation UI |
| `src/components/NavBar.tsx` | Server component nav bar with links to Library, Add, Chat |
| `vercel.json` | Vercel Cron schedule — `POST /api/cron/digest` every Monday 9 AM UTC |
| `.env.example` | Template listing all required/optional env vars |

## Dependencies

- `package.json` has an `"overrides"` block pinning `postcss` (^8.5.10) and
  `esbuild` (^0.28.1) — both are transitive deps (via `next` and via
  `drizzle-kit`/`tsx`'s `@esbuild-kit/*` chain) whose bundled versions had
  known CVEs. Keep these in sync if `npm audit` flags them again after future
  upgrades; `npm audit` should report 0 vulnerabilities.

## Database

- Connection string is in `.env.local` (gitignored) — must be a real Neon
  pooled connection string (from the Neon dashboard's Connection Details),
  not the `postgresql://user:password@host/dbname?...` placeholder in
  `.env.example`. With the placeholder, every DB-backed route 500s with an
  empty body.
- `VOYAGE_API_KEY` is in `.env.local` — required by `scripts/embed.ts` and `src/lib/embed.ts`
- `ANTHROPIC_API_KEY` is in `.env.local` — required by `src/lib/rag.ts` (Chat/RAG)
- `RESEND_API_KEY` is in `.env.local` — required by `src/lib/digest.ts` (weekly digest)
- `DIGEST_CRON_SECRET` is in `.env.local` — shared secret to authenticate `POST /api/cron/digest`
- `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — required by Auth.js (not needed while `AUTH_DISABLED=true`)
- `AUTH_DISABLED` — set to `"true"` in `.env.local` to bypass login entirely and use a fixed local dev user (`src/lib/dev-auth.ts`). Currently enabled since the app isn't deployed yet.
- Schema changes: edit `src/lib/schema.ts` → `npm run db:generate` → `npm run db:push`
- `highlights.embedding` is `vector(1536)`, nullable — populated by Phase 2 or the ingest API route
- `highlights.type` is `text`, default `highlight` — values: `highlight`, `note`
- `highlights.source` is `text`, default `kindle` — values: `kindle`, `pdf`, `manual`
- `users.last_digest_at` is `timestamp`, nullable — set after each digest send
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
- **Phase 5.2** (done): Better ingestion — `POST /api/ingest` (Kindle/PDF/manual), `app/add/page.tsx`, shared `lib/ingest.ts` + `lib/embed.ts`
- **Phase 5.3** (done): Chat/RAG — `POST /api/chat` streaming endpoint, `app/chat/page.tsx`, `lib/rag.ts` (Voyage + Claude)
- **Phase 5.4** (done): Scheduling — `POST /api/cron/digest`, `lib/digest.ts`, `vercel.json` Monday 9 AM cron, Resend email
- **Phase 5.5** (done): Dependency security — upgraded `next` (16.2.2→16.2.9)
  and `@anthropic-ai/sdk` (^0.82→^0.104.1), added `postcss`/`esbuild`
  overrides; `npm audit` now reports 0 vulnerabilities. Also hardened
  `src/app/page.tsx` and `src/app/add/page.tsx` fetch calls to check
  `res.ok`/handle empty bodies instead of throwing a raw JSON-parse error.
