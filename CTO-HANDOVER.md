# CTO Handover — Audience Lab Tools (“Drop The Mic”)

**Purpose of this doc:** Enough context to direct work. Not a runbook or code walkthrough. Implementation details live in the repo; you can instruct changes and have them executed in Cursor.

**Repo:** `https://github.com/DoriFussmann/audience-lab-tools`  
**Product name in UI:** Drop The Mic  
**Package name:** `audience-app`  
**Stage:** Early / single-operator prototype (few commits, stub README, no CI/deploy docs)

---

## What it is

An internal workflow tool for Audience Lab / Blueprint Intent operators:

1. **Define** a target audience (structured fields via chat + document upload)
2. **Find** matching segments in an uploaded taxonomy and build a Silver / Gold / Diamond tier plan
3. **Letter** generate tiered outreach email sequences (LLM)
4. **Fusion** attach lead CSVs to chosen audiences, score/dedupe, export a ranked list
5. **Admin** edit field schema, system prompts, and taxonomy upload
6. **Dashboard** project progress + copyable summary

Multi-project; work autosaves in the browser.

---

## Architecture (one sentence)

Single **Next.js 14** app: most domain logic runs in the browser; three thin API routes call **Anthropic** for Define / Find / Letter.

```
Browser UI + local persistence
        │
        ├── localStorage  → projects
        ├── IndexedDB     → taxonomy, field schema, prompts
        └── POST /api/{define,find,letter} → Anthropic Messages API
```

No separate backend, database, queue, or monorepo packages.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| App | Next.js 14 (App Router), React 18, TypeScript, Tailwind |
| LLM | `@anthropic-ai/sdk` → Claude (default model env / `claude-sonnet-5`) |
| Files | `xlsx` (taxonomy), `papaparse` (lead CSVs) |
| Persistence | `localStorage` + `idb-keyval` (IndexedDB) |
| Package manager | npm |

**Key folders**

| Path | Role |
|------|------|
| `app/page.tsx` | Main shell / navigation / state |
| `app/api/{define,find,letter}/` | LLM API routes |
| `components/` | UI per feature |
| `lib/` | Domain logic (types, match, fusion, prompts, store, Anthropic) |
| `scripts/` | Offline verify scripts (match / fusion) |

---

## Auth & data (critical)

| Topic | Reality |
|--------|---------|
| Login | Supabase email/password (no self-signup UI) |
| API routes | Session required — unauthenticated calls return 401 |
| Projects | Supabase Postgres (`projects.data` jsonb) + RLS; optional one-time localStorage import |
| Sharing | `project_shares`; owners manage; shared users can edit but not delete/share |
| Taxonomy / schema / prompts | `app_config` + Storage bucket `taxonomy`; IndexedDB cache only |
| Admin | Super-admin only (`profiles.is_super_admin`; seeded for `dori@thenightventures.com`) |
| Lead CSVs (Fusion) | **Not persisted** by design — re-attach after reload |

---

## Secrets & config

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ops | Server only — never expose |
| `ANTHROPIC_API_KEY` | Yes | `.env.local` (gitignored) |
| `ANTHROPIC_MODEL` | No | Overrides default model string |

See `.env.example` and `README.md` for deploy steps. Run `supabase/migration.sql` in the Supabase SQL editor before first use.

**Local run**

```bash
npm install
# create .env.local with ANTHROPIC_API_KEY=...
npm run dev
```

Scripts: `dev` / `build` / `start` only. No lint/test scripts in `package.json`.

---

## Deployment & ops

- **Not documented** — no Docker, Terraform, Vercel config, or GitHub Actions in-repo
- API routes set long `maxDuration` (Vercel-compatible hint only)
- Confirm canonical branch: local history has used `master`; remote may use `main`
- Operational prerequisite: taxonomy uploaded in Admin before Find; Anthropic key before LLM features

---

## Product / domain notes worth knowing

- **Field schema** is configurable in Admin (Offer / Journey / Precision / Lead / Letter); defaults + migration live in `lib/fields.ts`
- **Find** is hybrid: client-side retrieval over taxonomy → LLM basket selection → deterministic tier plan (`lib/match.ts`)
- **Letter** produces multi-tier, multi-email sequences from define + basket + style (`lib/letter.ts`, `/api/letter`)
- **Fusion** scores leads by audience role + pair bonuses; strips sensitive skiptrace-style columns on export (`lib/fusion.ts`)
- **Prompts** are editable in Admin with `{{token}}` placeholders (`lib/prompts.ts`)

---

## Gaps a CTO should decide on first

1. **Auth & API protection** — real users vs. open Anthropic bill risk
2. **Persistence policy** — stay browser-local (explicit single-user) vs. server DB / sync / backup
3. **Hosting** — where it runs (e.g. Vercel), env management, model ID validation
4. **CI / quality bar** — currently no automated tests, lint, or pipeline
5. **Docs** — taxonomy format, env template, deploy runbook (this file is the first intentional handover artifact)
6. **Branch naming** — align `main` vs `master`

---

## How to work with this codebase going forward

You do not need to dig into implementation yourself. Typical flow:

1. Decide product / architecture direction (auth, storage, deploy, feature priority)
2. Give clear instructions
3. Changes are executed in Cursor against this repo

**Useful first questions to answer as CTO**

- Who is allowed to use this, and from where?
- Is browser-only data acceptable for the next N months?
- What is “done” for production (auth + host + monitoring minimum)?
- Which workflow (Define / Find / Letter / Fusion) is the commercial priority?

---

## Quick index

| Need | Where |
|------|--------|
| Domain types | `lib/types.ts` |
| Defaults / schema | `lib/fields.ts` |
| Matching & tiers | `lib/match.ts` |
| Lead fusion | `lib/fusion.ts` |
| LLM client + env | `lib/anthropic.ts` |
| Project save | `lib/store.ts` |
| Fake login | `components/LoginGate.tsx` |
| Dependencies | `package.json` |
