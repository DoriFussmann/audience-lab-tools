# audience-lab-tools

Drop The Mic — Audience Lab workflow tools (Define → Find → Letter → Fusion).

## Stack

- Next.js 14 (App Router), React 18, TypeScript, Tailwind
- Supabase Auth, Postgres (RLS), Storage
- Anthropic Claude via `/api/define`, `/api/find`, `/api/letter`

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Where used | Notes |
|----------|------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server | Anon/public key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never expose to the browser |
| `ANTHROPIC_API_KEY` | API routes | Required for Define / Find / Letter |
| `ANTHROPIC_MODEL` | API routes | Optional; defaults to `claude-sonnet-5` |

## Database setup

1. Open the Supabase SQL editor.
2. Paste and run [`supabase/migration.sql`](supabase/migration.sql) (idempotent).
3. Confirm tables: `profiles`, `projects`, `project_shares`, `app_config`, and the private Storage bucket `taxonomy`.

## Users

There is no self-signup UI. Create users in the **Supabase Dashboard → Authentication → Users** (email + password). The first profile for `dori@thenightventures.com` is automatically marked `is_super_admin`.

## Local development

```bash
npm install
# create .env.local with the variables above
npm run dev
```

## Deploy (Vercel)

1. Import the GitHub repo into Vercel.
2. Point the project at the **repo’s default branch** (align `main` / `master` in Vercel settings if needed).
3. Set the five env vars in the Vercel project settings.
4. Deploy. Run the migration in Supabase before first use.
5. Create operator accounts in the Supabase Auth dashboard.

Lead CSV data in Fusion stays memory-only and is never persisted or uploaded.
