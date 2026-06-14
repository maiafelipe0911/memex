# Memex

A personal knowledge companion for readers. Import highlights from Kindle,
PDFs, or your own notes, and Memex automatically finds **unexpected
connections** between ideas across different books — then lets you chat with
your whole library using RAG.

## Features

- **Library** — browse your books and highlights in a three-panel layout
  (Books → Highlights → Connections)
- **Cross-book connections** — every highlight is embedded with Voyage AI
  (`voyage-large-2`) and compared via pgvector cosine similarity to surface
  semantically related passages from *other* books — the kind of resonance
  you'd never spot by memory alone
- **Flexible ingestion** — add highlights three ways:
  - Paste a Kindle `My Clippings.txt` file (auto-parsed by book/author/page)
  - Upload a PDF (text extracted and chunked automatically)
  - Type/paste notes manually
- **Chat with your library (RAG)** — ask questions and get streamed answers
  from Claude, grounded in the highlights most relevant to your question
- **Weekly digest** — a scheduled email (via Resend) that resurfaces a pair
  of connected highlights from your library each week
- **Multi-user auth** — GitHub & Google OAuth via Auth.js, with full
  per-user data isolation

## Tech stack

| Layer | Tech |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| Database | [Neon](https://neon.tech) Postgres (serverless) + `pgvector` |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Auth | [Auth.js](https://authjs.dev) v5 (GitHub + Google OAuth) |
| Embeddings | [Voyage AI](https://www.voyageai.com) (`voyage-large-2`, 1536-dim) |
| LLM / RAG | [Anthropic Claude](https://www.anthropic.com) |
| Email | [Resend](https://resend.com) |
| Styling | Tailwind CSS v4 |
| Language | TypeScript (strict) |

## How it works

```
My Clippings.txt / PDF / manual notes
        │
        ▼
  POST /api/ingest  ──parses──>  books + highlights (Postgres)
        │
        ▼
  Voyage AI embeddings  ──>  highlights.embedding (vector(1536))
        │
        ▼
  pgvector cosine similarity (<=>)
        │
        ├──> GET /api/highlights/:id/connections  → cross-book connections
        └──> POST /api/chat                       → RAG chat (Claude)
```

## Getting started

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres database with the `pgvector`
  extension enabled
- API keys: [Voyage AI](https://www.voyageai.com) and
  [Anthropic](https://console.anthropic.com) (optional: Resend, GitHub/Google
  OAuth apps)

### Setup

```bash
npm install
cp .env.example .env.local   # then fill in your values, see below
npm run db:push              # push the schema to your Neon database
npm run dev                  # http://localhost:3000
```

### Environment variables

See [`.env.example`](.env.example) for the full list. Key ones:

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Everything | Neon pooled connection string |
| `AUTH_DISABLED` | Local dev | `"true"` bypasses OAuth login entirely and uses a fixed local dev user — handy while running locally without setting up OAuth apps |
| `AUTH_SECRET`, `AUTH_GITHUB_*`, `AUTH_GOOGLE_*` | Production auth | Not needed while `AUTH_DISABLED=true` |
| `VOYAGE_API_KEY` | Embeddings | Used by `npm run embed` and ingestion |
| `ANTHROPIC_API_KEY` | Chat / RAG | Used by `/api/chat` |
| `RESEND_API_KEY`, `DIGEST_CRON_SECRET` | Weekly digest | Optional |

### Importing your Kindle highlights

```bash
npm run ingest "path/to/My Clippings.txt"   # one-time CLI import
npm run embed                               # generate embeddings (idempotent)
```

Or use the **Add Highlights** page (`/add`) in the app, which ingests and
embeds in one step (Kindle, PDF, or manual entry).

## Available scripts

```bash
npm run dev           # start dev server
npm run build         # production build
npm run db:generate   # generate a migration from schema changes
npm run db:push       # push schema to Neon
npm run db:studio     # open Drizzle Studio
npm run ingest <file> # import Kindle highlights
npm run embed         # generate embeddings for all unembedded highlights
```

## Status

All core phases are complete: ingestion (Kindle/PDF/manual), embeddings,
cross-book connections, the three-panel UI, auth & multi-user isolation,
RAG chat, and the weekly digest. See [`CLAUDE.md`](CLAUDE.md) for the
detailed architecture/roadmap and [`explanation.md`](explanation.md) for a
file-by-file walkthrough of how everything was built.
