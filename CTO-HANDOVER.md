# CTO Handover — Audience Lab Tools ("Drop The Mic")

**Purpose of this doc:** Enough context to direct work. Not a runbook or code walkthrough. Implementation details live in the repo; you can instruct changes and have them executed in Cursor.

**Repo:** `https://github.com/DoriFussmann/audience-lab-tools`  
**Product name in UI:** Drop The Mic  
**Package name:** `audience-app`  
**Stage:** Active internal tool — Supabase auth + multi-user sharing live; Instantly SuperSearch + Define PDF reports shipped; no CI yet

---

## What it is

An internal workflow tool for Audience Lab / Blueprint Intent operators:

1. **Define** a target audience (structured fields via chat + document upload); optional **Definition Summary PDF** preview/save
2. **Find** — two sources under one stage:
   - **Audience Lab** — match segments in an uploaded taxonomy → Silver / Gold / Diamond tier plan
   - **Instantly** — LLM-translate the definition into Instantly SuperSearch filters, count/preview leads
3. **Letter** generate tiered outreach email sequences (LLM); supports revision feedback; inputs are labeled links + key messages
4. **Fusion** attach lead CSVs to chosen audiences, score/dedupe, export **per-tier** ranked CSVs
5. **Audit** LLM-audit a pseudonymized sample of fused leads against the audience definition — per-lead fit score, why-fits / why-not, and basket-level pattern analysis
6. **Admin** edit field schema, system prompts (modal editors), and taxonomy upload
7. **Dashboard** project progress + copyable summary + open saved Definition PDF

Multi-project; work autosaves to Supabase.

---

## Architecture (one sentence)

Single **Next.js 14** app: most domain logic runs in the browser; thin API routes call **Anthropic** (Define / Find / Letter / Audit / Instantly-translate) and **Instantly** (search); **Supabase** handles auth, project persistence, and file storage.

```
Browser UI
        │
        ├── Supabase Postgres  → projects (jsonb), profiles, project_shares, app_config
        ├── Supabase Storage   → taxonomy bucket, project-reports bucket (Define PDFs)
        ├── IndexedDB          → taxonomy cache, field schema, prompts
        ├── localStorage       → stage bottom-lines (fusion/audit), last-project, migration flag
        ├── POST /api/{define,find,letter,audit,instantly/translate} → Anthropic
        ├── POST /api/instantly/search → Instantly SuperSearch API
        ├── /api/define-report → upload / download / delete Definition PDFs
        └── GET /api/health → env presence booleans only (no auth, no secret values)
```

No separate backend, queue, or monorepo packages. A standalone **`design-system/`** Vite reference app lives in-repo (tokens + demo screens; excluded from the Next.js typecheck) — not part of the runtime product.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Next.js 14 (App Router), React 18, TypeScript, Tailwind |
| LLM | `@anthropic-ai/sdk` → Claude (default model env / `claude-sonnet-5`) |
| Lead search | Instantly SuperSearch API (`INSTANTLY_API_KEY`, server-only) |
| Auth / DB | Supabase (email/password auth, Postgres, Storage, RLS) |
| Files | `xlsx` (taxonomy), `papaparse` (lead CSVs), `jspdf` (Define PDF) |
| Persistence | Supabase Postgres (primary) + `localStorage` (stage bottom-lines, last-project) + `idb-keyval` (IndexedDB — taxonomy/config cache) |
| Package manager | npm |

**Key folders**

| Path | Role |
|------|------|
| `app/page.tsx` | Main shell / navigation / state |
| `app/api/{define,find,letter,audit,define-report,health,instantly/}/` | API routes |
| `components/` | UI per feature (`InstantlyFind`, `DefineReportPreview`, `LoadingModal`, …) |
| `lib/` | Domain logic (types, match, fusion, instantly, defineReport, prompts, store, Anthropic) |
| `design-system/` | Standalone token/demo reference (not served by the Next app) |
| `scripts/` | Offline verify scripts (match / fusion) |

---

## Auth & data (critical)

| Topic | Reality |
|-------|---------|
| Login | Supabase email/password (no self-signup UI) |
| API routes | Session required — unauthenticated calls return 401 (`/api/health` is the exception) |
| Projects | Supabase Postgres (`projects.data` jsonb) + RLS; one-time localStorage migration on first login if legacy local data exists |
| Sharing | `project_shares`; owners manage; shared users can edit but not delete/share |
| Taxonomy / schema / prompts | `app_config` + Storage bucket `taxonomy`; IndexedDB cache only |
| Definition PDFs | Storage bucket `project-reports`; metadata on the project; upload/download via `/api/define-report` |
| Admin | Super-admin only (`profiles.is_super_admin`; seeded for `dori@thenightventures.com`) |
| Lead CSVs (Fusion) | **Not persisted** by design — re-attach after reload |
| Instantly preview leads | Session/UI state on the project; not a durable CRM sync |
| Audit / Fusion bottom-lines | Saved to both Supabase (with project) and localStorage; merged on load so results survive a mid-flight save |

---

## Secrets & config

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ops | Server only — never expose |
| `ANTHROPIC_API_KEY` | Yes | `.env.local` (gitignored) |
| `ANTHROPIC_MODEL` | No | Overrides default model string |
| `INSTANTLY_API_KEY` | For Instantly Find | Server only — never expose |

See `.env.example` and `README.md` for deploy steps. Run `supabase/migration.sql` in the Supabase SQL editor before first use (creates tables + `taxonomy` + `project-reports` buckets).

**Local run**

```bash
npm install
# create .env.local with ANTHROPIC_API_KEY=..., Supabase vars, and INSTANTLY_API_KEY=... if using Instantly Find
npm run dev
```

Scripts: `dev` / `build` / `start` only. No lint/test scripts in `package.json`.

---

## Deployment & ops

- **README** has a short Vercel checklist; still no Docker, Terraform, or GitHub Actions in-repo
- API routes set long `maxDuration` (Vercel-compatible hint only)
- Branch: `main`
- `/api/health` reports whether Anthropic / Supabase env vars are present (booleans only) — useful for deploy smoke checks
- Operational prerequisites: Supabase project configured + `migration.sql` run; taxonomy uploaded in Admin before Audience Lab Find; Anthropic key before LLM features; Instantly key before Instantly Find

---

## Product / domain notes worth knowing

- **Field schema** is configurable in Admin (Offer / Journey / Precision / Lead / Letter); defaults + migration live in `lib/fields.ts`
- **Find (Audience Lab)** is hybrid: client-side retrieval over taxonomy → LLM basket selection → deterministic tier plan (`lib/match.ts`)
- **Find (Instantly)** translates define fields → SuperSearch `search_filters` via LLM (`/api/instantly/translate`, editable Admin prompt `instantlyFind`), then counts/previews via `/api/instantly/search` (`lib/instantly.ts`, `components/InstantlyFind.tsx`)
- **Define PDF** builds a client-side jsPDF “Definition Summary”, previews in-app, and persists to Storage (`lib/defineReport.ts`, `/api/define-report`)
- **Letter** produces multi-tier, multi-email sequences from define + basket + labeled links / key messages; operators can request a full rewrite with feedback (`lib/letter.ts`, `/api/letter`)
- **Fusion** scores leads by audience role + pair bonuses; strips sensitive skiptrace-style columns; exports **one CSV per tier** (`lib/fusion.ts`)
- **Audit** pseudonymizes fused leads (allowlist of safe demographic/professional columns — no names, emails, phones, addresses) before sending to the LLM; results include per-lead `fitPercent` + narrative, plus basket-level pattern analysis (`components/AudienceAudit.tsx`, `/api/audit`)
- **Prompts** are editable in Admin (modals) with `{{token}}` placeholders for five LLM stages: define, find, letter, audit, instantlyFind (`lib/prompts.ts`)
- **Loading modal** covers slow API/compute operations across stages

---

## Gaps a CTO should decide on first

1. ~~**Auth & API protection**~~ — ✅ Supabase auth live; session required on sensitive API routes
2. ~~**Persistence policy**~~ — ✅ Supabase Postgres is primary store; localStorage is a resilience layer only
3. **Hosting** — where it runs (e.g. Vercel), env management, model ID validation, Instantly key ops
4. **CI / quality bar** — currently no automated tests, lint, or pipeline
5. **Docs** — taxonomy format, Instantly filter contract, fuller deploy/runbook (README is minimal)
6. **Multi-operator scale** — current RLS model works for a small team; revisit if access control requirements grow
7. **Find product path** — Audience Lab taxonomy vs Instantly SuperSearch as the commercial default (or both)

---

## How to work with this codebase going forward

You do not need to dig into implementation yourself. Typical flow:

1. Decide product / architecture direction (hosting, feature priority, quality bar)
2. Give clear instructions
3. Changes are executed in Cursor against this repo

**Useful questions to answer as CTO**

- What is "done" for production (hosting + monitoring minimum)?
- Which workflow (Define / Find / Letter / Fusion / Audit) and which Find source is the commercial priority?
- What is the acceptable Anthropic + Instantly spend per operator per month?
- Should operators ever export audit results, or is it a session-only review tool?

---

## Quick index

| Need | Where |
|------|-------|
| Domain types | `lib/types.ts` |
| Defaults / schema | `lib/fields.ts` |
| Matching & tiers | `lib/match.ts` |
| Instantly filters / Find state | `lib/instantly.ts` |
| Lead fusion | `lib/fusion.ts` |
| Define PDF build + Storage paths | `lib/defineReport.ts` |
| LLM client + env | `lib/anthropic.ts` |
| Project persistence (Supabase) | `lib/projects.ts` |
| Stage bottom-lines + migration (localStorage) | `lib/store.ts` |
| LLM prompts (all 5 stages) | `lib/prompts.ts` |
| Login gate (Supabase auth) | `components/LoginGate.tsx` |
| Design tokens / reference UI | `design-system/` |
| Dependencies | `package.json` |
