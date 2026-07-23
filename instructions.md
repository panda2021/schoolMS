# Abogida — Operational Instructions

## Transactional email (Mailtrap + send-email edge function)

Email is sent through the `send-email` Supabase edge function (`supabase/functions/send-email/index.ts`), which calls the Mailtrap Send API. Deployed to project `jtvjptwmciizqccrpunj` (v3, verified live 2026-07-23).

**Secrets** (Supabase dashboard > Edge Functions > Secrets):

| Secret | Notes |
|---|---|
| `MAILTRAP_API_TOKEN` | Required. Same token lives locally in `.env` at project root (gitignored). |
| `MAILTRAP_FROM_EMAIL` | Optional; defaults to `hello@demomailtrap.co` (Mailtrap demo domain). Update after verifying a real owned domain — vercel.app subdomains cannot be sender domains. |
| `MAILTRAP_FROM_NAME` | Optional; defaults to `ABOGIDA`. |

**Behavior / contract:**

- POST with the logged-in user's JWT as `Authorization: Bearer <access_token>` plus the anon `apikey` header.
- Body: `{ to: string | string[], subject: string, text?: string, html?: string, category?: string }`. Max 50 recipients; `subject` and one of `text`/`html` required.
- **Role gate:** looks up `public.users.role_key` — only `super_admin`, `school_admin`, `teacher` may send. Parents get 403; missing/anon JWT gets 401. Verified live 2026-07-23 (positive path: school admin 200 + delivery; negative paths: parent 403, anon 401).

**Redeploy after editing:**

Use the Supabase MCP `deploy_edge_function` tool (or `supabase functions deploy send-email` with the CLI). No `verify_jwt` change needed — default (on) is correct.

**Auth emails (invites, password resets) via Mailtrap SMTP** — dashboard config, not code: Authentication > Emails > SMTP Settings → host `live.smtp.mailtrap.io`, port `587`, user `api`, password = the Mailtrap token from `.env`. Then raise the auth email rate limits (Authentication > Rate Limits).

## Seed demo users

One demo login per role (super_admin, school_admin, teacher, parent), all sharing a single password, so testers can try every dashboard. The script is idempotent: safe to re-run any time a demo login breaks (it resets passwords, repairs orphaned `public.users` rows, and re-verifies login).

**Command** (run from the project root):

```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> node scripts/seed-demo-users.mjs --yes
```

Without `--yes` it only prints the target project URL and exits (dry safety check).

**Env vars:**

| Var | Required | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | yes | From Supabase dashboard > Settings > API. Never commit it, never put it in `frontend/.env.local`. |
| `SUPABASE_URL` | no | Falls back to `VITE_SUPABASE_URL` in `frontend/.env.local`. |
| `SUPABASE_ANON_KEY` | no | Falls back to `VITE_SUPABASE_ANON_KEY` in `frontend/.env.local`. Used for the login smoke test. |
| `DEMO_PASSWORD` | no | Shared password for all four accounts. If unset, a strong one is generated and printed/saved. Pass the same value on re-runs to keep the password stable. |

**What it does:**

1. Ensures the school `[DEMO] Abogida Demo School` exists (`is_demo = true`, so super-admin "Wipe demo data" can remove it).
2. For each role: creates the Supabase auth user (email pre-confirmed) or resets its password if it exists — auth user first, so the `users_id_fkey` FK on `public.users.id -> auth.users.id` is always satisfiable.
3. Deletes orphaned `public.users` rows holding a demo email under a different id (the historical "invalid credentials"/orphaned-admin bug), then upserts the profile row with the correct role_key and school.
4. Upserts `public.teachers` / `public.parents` specialization rows; links the demo parent to a demo student so the parent dashboard has content.
5. Smoke test: `signInWithPassword` with the ANON key for each account (the exact call `Login.tsx` makes) and verifies the `public.users` row resolves to the expected role — the same lookup `RoleRedirect.tsx` does.
6. Regenerates `DEMO_LOGINS.md` at the project root with emails, the password, and per-role pass/fail. Share that file with testers.

Exit code is non-zero if any role fails the login smoke test.

**Prerequisite:** `@supabase/supabase-js` must be installed (`cd frontend && npm install` — the script resolves it from `frontend/node_modules`).

**Demo accounts** (fixed emails):

- `demo-super-admin@abogida-demo.com` — super_admin
- `demo-school-admin@abogida-demo.com` — school_admin
- `demo-teacher@abogida-demo.com` — teacher
- `demo-parent@abogida-demo.com` — parent
