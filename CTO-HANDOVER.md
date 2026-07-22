# CTO Handover — Audience Lab Tools ("Drop The Mic")

**Purpose of this doc:** Enough context to direct work. Not a runbook or code walkthrough. Implementation details live in the repo; you can instruct changes and have them executed in Cursor.

**Repo:** `https://github.com/DoriFussmann/audience-lab-tools`  
**Product name in UI:** Drop The Mic  
**Package name:** `audience-app`  
**Stage:** Active internal tool — Supabase auth + multi-user sharing live; no CI/deploy docs yet

---

## What it is

An internal workflow tool for Audience Lab / Blueprint Intent operators:

1. **Define** a target audience (structured fields via chat + document upload)
2. **Find** matching segments in an uploaded taxonomy and build a Silver / Gold / Diamond tier plan
3. **Letter** generate tiered outreach email sequences (LLM)
4. **Fusion** attach lead CSVs to chosen audiences, score/dedupe, export a ranked list
5. **Audit** LLM-audit a pseudonymized sample of fused leads against the audience definition — per-lead fit score, why-fits / why-not, and basket-level pattern analysis
6. **Admin** edit field schema, system prompts, and taxonomy upload
7. **Dashboard** project progress + copyable summary

Multi-project; work autosaves to Supabase.

---

## Architecture (one sentence)

Single **Next.js 14** app: most domain logic runs in the browser; four thin API routes call **Anthropic** for Define / Find / Letter / Audit; **Supabase** handles auth and project persistence.

```
Browser UI
        │
        ├── Supabase Postgres  → projects (jsonb), profiles, project_shares
        ├── Supabase Storage   → taxonomy bucket
        ├── IndexedDB          → taxonomy cache, field schema, prompts
        ├── localStorage       → stage bottom-lines (fusion/audit), last-project, migration flag
        └── POST /api/{define,find,letter,audit} → Anthropic Messages API
```

No separate backend, queue, or monorepo packages.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Next.js 14 (App Router), React 18, TypeScript, Tailwind |
| LLM | `@anthropic-ai/sdk` → Claude (default model env / `claude-sonnet-5`) |
| Auth / DB | Supabase (email/password auth, Postgres, Storage, RLS) |
| Files | `xlsx` (taxonomy), `papaparse` (lead CSVs) |
| Persistence | Supabase Postgres (primary) + `localStorage` (stage bottom-lines, last-project) + `idb-keyval` (IndexedDB — taxonomy/config cache) |
| Package manager | npm |

**Key folders**

| Path | Role |
|------|------|
| `app/page.tsx` | Main shell / navigation / state |
| `app/api/{define,find,letter,audit}/` | LLM API routes |
| `components/` | UI per feature |
| `lib/` | Domain logic (types, match, fusion, prompts, store, Anthropic) |
| `scripts/` | Offline verify scripts (match / fusion) |

---

## Auth & data (critical)

| Topic | Reality |
|-------|---------|
| Login | Supabase email/password (no self-signup UI) |
| API routes | Session required — unauthenticated calls return 401 |
| Projects | Supabase Postgres (`projects.data` jsonb) + RLS; one-time localStorage migration on first login if legacy local data exists |
| Sharing | `project_shares`; owners manage; shared users can edit but not delete/share |
| Taxonomy / schema / prompts | `app_config` + Storage bucket `taxonomy`; IndexedDB cache only |
| Admin | Super-admin only (`profiles.is_super_admin`; seeded for `dori@thenightventures.com`) |
| Lead CSVs (Fusion) | **Not persisted** by design — re-attach after reload |
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

See `.env.example` and `README.md` for deploy steps. Run `supabase/migration.sql` in the Supabase SQL editor before first use.

**Local run**

```bash
npm install
# create .env.local with ANTHROPIC_API_KEY=... and Supabase vars
npm run dev
```

Scripts: `dev` / `build` / `start` only. No lint/test scripts in `package.json`.

---

## Deployment & ops

- **Not documented** — no Docker, Terraform, Vercel config, or GitHub Actions in-repo
- API routes set long `maxDuration` (Vercel-compatible hint only)
- Branch: `main`
- Operational prerequisites: Supabase project configured + `migration.sql` run; taxonomy uploaded in Admin before Find; Anthropic key before LLM features

---

## Product / domain notes worth knowing

- **Field schema** is configurable in Admin (Offer / Journey / Precision / Lead / Letter); defaults + migration live in `lib/fields.ts`
- **Find** is hybrid: client-side retrieval over taxonomy → LLM basket selection → deterministic tier plan (`lib/match.ts`)
- **Letter** produces multi-tier, multi-email sequences from define + basket + inputs (`lib/letter.ts`, `/api/letter`)
- **Fusion** scores leads by audience role + pair bonuses; strips sensitive skiptrace-style columns on export (`lib/fusion.ts`)
- **Audit** pseudonymizes fused leads (allowlist of safe demographic/professional columns — no names, emails, phones, addresses) before sending to the LLM; results include per-lead `fitPercent` + narrative, plus basket-level pattern analysis (`components/AudienceAudit.tsx`, `/api/audit`)
- **Prompts** are editable in Admin with `{{token}}` placeholders for all four LLM stages: define, find, letter, audit (`lib/prompts.ts`)

---

## Gaps a CTO should decide on first

1. ~~**Auth & API protection**~~ — ✅ Supabase auth live; all API routes require session
2. ~~**Persistence policy**~~ — ✅ Supabase Postgres is primary store; localStorage is a resilience layer only
3. **Hosting** — where it runs (e.g. Vercel), env management, model ID validation
4. **CI / quality bar** — currently no automated tests, lint, or pipeline
5. **Docs** — taxonomy format, env template, deploy runbook
6. **Multi-operator scale** — current RLS model works for a small team; revisit if access control requirements grow

---

## How to work with this codebase going forward

You do not need to dig into implementation yourself. Typical flow:

1. Decide product / architecture direction (hosting, feature priority, quality bar)
2. Give clear instructions
3. Changes are executed in Cursor against this repo

**Useful questions to answer as CTO**

- What is "done" for production (hosting + monitoring minimum)?
- Which workflow (Define / Find / Letter / Fusion / Audit) is the commercial priority?
- What is the acceptable Anthropic spend per operator per month?
- Should operators ever export audit results, or is it a session-only review tool?

---

## Quick index

| Need | Where |
|------|-------|
| Domain types | `lib/types.ts` |
| Defaults / schema | `lib/fields.ts` |
| Matching & tiers | `lib/match.ts` |
| Lead fusion | `lib/fusion.ts` |
| LLM client + env | `lib/anthropic.ts` |
| Project persistence (Supabase) | `lib/projects.ts` |
| Stage bottom-lines + migration (localStorage) | `lib/store.ts` |
| LLM prompts (all 4 stages) | `lib/prompts.ts` |
| Login gate (Supabase auth) | `components/LoginGate.tsx` |
| Dependencies | `package.json` |
