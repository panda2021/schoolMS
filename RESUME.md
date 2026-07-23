# RESUME — ABOGIDA/FIDEL school management app handoff

**Last worked on**: 2026-07-23
**Branch**: `main` (run `git status` before resuming)

## Session snapshot (2026-07-23) — Mailtrap email integration

Switched transactional email from Supabase built-in to Mailtrap. All verified live:

- **`send-email` edge function** deployed (v3) to `jtvjptwmciizqccrpunj` — source at
  `supabase/functions/send-email/index.ts`. Staff-only gate on `users.role_key`
  (`super_admin`/`school_admin`/`teacher`), max 50 recipients, Mailtrap Send API backend.
- **Secrets**: `MAILTRAP_API_TOKEN` set in dashboard; token also in `.env` at project root
  (gitignored). Sender defaults to Mailtrap demo domain `hello@demomailtrap.co`.
- **Tests passed 2026-07-23**: positive (school admin → 200, email delivered) and negative
  (parent → 403, anon no-bearer → 401, anon-key bearer → 401).
- Ops doc: `instructions.md` > "Transactional email".

**Still open:**
- Dashboard SMTP config for *auth* emails (invites/resets): `live.smtp.mailtrap.io:587`,
  user `api`, password = Mailtrap token; then raise auth rate limits. (Eyoel's dashboard task —
  confirm whether done.)
- Verify a real owned domain in Mailtrap (vercel.app subdomains can't be sender domains),
  then update `MAILTRAP_FROM_EMAIL` secret.

## Session snapshot (2026-07-06) — security audit + hardening

Multi-agent audit of the live app (project `jtvjptwmciizqccrpunj`). Fixed and deployed
(commits `67a09c2`..`00dcf5f`, all pushed; Vercel bundle verified live):

- **0034** — CRITICAL role self-escalation (trigger `guard_user_privilege_columns` blocks
  `role_key`/`school_id` changes from end-user roles); dropped cross-tenant `schools_*_any`
  policies (super-admin-only writes); scoped cross-school media DELETE; added super-admin
  media SELECT; revoked anon EXECUTE on 6 mutating RPCs.
- **0035** — parent media-attachment privacy leak closed (role-split `media_assets` SELECT;
  verified a private message attachment is visible to exactly 1 parent, cascades to storage);
  path-scoped media INSERT; scoped branding SELECT; dropped conflicting announcement policies;
  fixed `is_in_same_school` NULL-school bug.
- **0036** — pinned function `search_path` (4 fns); dropped 2 duplicate unique constraints;
  added 6 hot FK indexes.
- **Frontend (0039 commit)** — role-based route guards (`RoleProvider`/`RequireRole`),
  fixed `RequireAuth` onAuthStateChange leak, bulk-import enrollment error surfacing,
  targeted-announcement rollback on recipient failure, helpdesk super-admin attachments
  (use ticket school), `uploaded_by` population + storage orphan cleanup in all upload paths.
- Earlier same day: **0032/0033** fixed branding+media upload RLS (`INSERT..RETURNING` needs
  a covering SELECT policy).

**Still open (reported, not applied):** enable Auth leaked-password protection (dashboard
toggle — can't do via SQL); LOW perf items deferred (initplan `auth.uid()` per-row rewrite on
26 policies, pg_graphql anon exposure, unused-index review after 30d); `classes_select` /
`parent_students_select` dedup deferred (hygiene, teacher-visibility risk). FeatureProvider
load-failure still console-only (fails closed).

---

All decisions (D1-D6) locked in memory at `project_personalization_decisions.md`.
**Also read `docs/PROGRESS.md`** — append-only changelog of every major step.

## Session snapshot (2026-07-02, in progress)

- **Applied in Supabase**: 0025-0030 applied. `0031_phase5_capabilities.sql` written, NOT yet applied.
- **Orphaned school_admins**: re-linked by user (2026-07-02). Resolved.
- **Phases 1-3 committed**: `5e3be0c` (Phase 1), `020ff52` (admin-creation fix), `a9f4a0f` (Phase 2), `0bdc7ea` (Phase 3). Password-reset work (0029 + UI) deployed 2026-07-02.
- **Deployed through**: parent-model fix + UI overhaul (user pushed 2026-07-02).
- **Uncommitted in working tree (this session)**: Phase 4 (Settings.tsx subject editing) + error-dialog ToastProvider + Phase 5 (0031 migration, UserOverridesModal, capability gating sweep across BulkImport/ReportCards/Updates/Announcements/Classes/Attendance/Teachers/Parents, AppShell attendance nav). See docs/PROGRESS.md.
- **All build phases (1-5) are now code-complete.** Remaining: apply 0031, deploy, end-to-end testing pass, and the deferred deep step ("Phase 5b": move domain-table RLS onto user_can() so additive per-user grants work beyond UI surfaces).

## TL;DR — next things to do

1. **User: apply `0031_phase5_capabilities.sql`**, commit + push, redeploy.
2. **Run `docs/TESTING.md`** — the complete ~20-min manual pass, role by role. Automated + live-DB smoke already green (12/12, see `scripts/smoke_phase5.mjs`).
3. Deferred for a future session: **Phase 5b** (move domain-table RLS onto `user_can()` so per-user grants work beyond UI surfaces), Phase 6 (student-as-user, only if D1 flips), subdomain branding, bundle code-splitting.

---

## What was changed this session

### Migrations
| # | File | Applied? | What it does |
|---|---|---|---|
| 0025 | `fix_invite_consumption.sql` | ✅ (user confirmed) | Fixes `ensure_user_profile()` so the `pending_invitations` SELECT bypasses RLS (`SET row_security = off`), and adds a recovery path for users stuck in the legacy `parent / NULL school` state. Teacher invite link now correctly lands on `/app/teacher`. |
| 0026 | `fix_admin_reset_password.sql` | ✅ (user confirmed 2026-06-29) | Adds `extensions` to `search_path` in `admin_reset_password` so `crypt()` and `gen_salt()` resolve. Also adds a `NOT FOUND` check so the RPC errors loudly if the target user doesn't exist. |
| 0027 | `feature_permissions.sql` | ✅ (user confirmed 2026-07-02) | Phase 2 RBAC framework. Creates `features`, `role_features`, `user_feature_overrides`; adds `user_can(text,uuid)` + `my_features()` SECURITY DEFINER helpers; RLS; seeds the capability catalog and role defaults to reproduce current behavior exactly (non-breaking). |
| 0028 | `school_branding.sql` | ✅ (user confirmed 2026-07-02) | Phase 3 branding. Adds `logo_url`, `primary_color`, `secondary_color`, `bg_image_url`, `bg_opacity` to `schools`; creates a public `branding` storage bucket; adds storage.objects write policies (super_admin any folder, school_admin own `<school_id>/` folder). |
| 0029 | `staff_reset_password.sql` | ✅ (user confirmed 2026-07-02) | Adds `users.reset_password` capability (seeded to school_admin) and widens `admin_reset_password`: super_admin → anyone; capability holders → teachers/parents in own school. |
| 0030 | `parent_invites_and_pending.sql` | ✅ (user confirmed 2026-07-02) | Parent-model fix: invitations carry `student_ids`+`relation` (auto-link at first login); uninvited sign-ins become role `'pending'` (D2) with approve/reject RPCs; ghosts migrated; `parents.*` capabilities; relation CHECK. |
| 0031 | `phase5_capabilities.sql` | ❌ **PENDING** | Phase 5: `children.attendance.view` (seeded to parent), `users.manage_permissions` (seeded to school_admin), removes teacher `classes.create/edit` seeds to match the UI. |

### Frontend
- **`frontend/src/pages/Attendance.tsx`** — new admin branch: date range, class, grade, status, name-search filters, 4 summary tiles, CSV export. Existing teacher / parent branches unchanged. `tsc --noEmit` clean.
- **`frontend/src/pages/SuperAdminDashboard.tsx`** — two changes:
  - When a school shows "No admin", the modal now offers a dropdown of all existing school_admin users (orphans labelled "unassigned"; ones linked to another school show that school name). Pick + click Assign re-links them by setting `users.school_id`.
  - Fixed `createAdminForSchool` to create the new admin **first** and unlink the previous admin **after** success — previously it unlinked first, so any `signUp` failure orphaned the old admin permanently. This is the most likely original cause of the current orphans.
- **`frontend/ROUTES.md`** — new authoritative routing + login-flow doc (all 6 flows: existing login, teacher invite, parent magic link, brand-new user with no invite, super-admin create school, super-admin reset PW). Update this file whenever a route, `emailRedirectTo`, or `RoleRedirect` changes.

### Scripts
- **`scripts/diagnose_admin_links.sql`** — 4 SQL blocks for the orphan-admin investigation: list all admins + school_id; list schools without admin; best-effort guess mapping by `created_at` proximity; manual UPDATE template.

---

## Orphan admin recovery

User ran the diagnostic. Two orphans were found:

| Orphan admin (user.id, name) | Best-guess school | Confidence |
|---|---|---|
| `5c7f2a9d-392a-4ed1-ac41-fa952bb9b3c1` "Admin User" (created 2026-03-21) | `fec4f736-ee3f-404f-8a11-3bd6e6bcd7a6` "Saint Joseph School" (created 2026-04-12) | **Low** — 22 days apart, guess only |
| `8302cb8e-b76c-41d2-b478-14b53dd819e1` "adminAddis Ababa" (created 2026-05-07 13:00) | `f1a6a371-8be0-40f5-b196-63dc73947dc8` "[DEMO] Bahir Dar Heritage School" (created 2026-05-07 12:59) | **High** — 56 seconds apart |

User has NOT yet run the email-verification SQL or the UPDATEs. Outstanding actions:

```sql
-- 1. Real emails (truth is in auth.users, not public.users.email which is a denormalized copy and often NULL)
SELECT u.id, u.full_name, au.email
FROM public.users u
JOIN auth.users au ON au.id = u.id
WHERE u.id IN (
  '5c7f2a9d-392a-4ed1-ac41-fa952bb9b3c1',
  '8302cb8e-b76c-41d2-b478-14b53dd819e1'
);

-- 2. Apply Bahir Dar fix (high confidence)
UPDATE public.users SET school_id = 'f1a6a371-8be0-40f5-b196-63dc73947dc8'
WHERE id = '8302cb8e-b76c-41d2-b478-14b53dd819e1' AND role_key = 'school_admin';

-- 3. Apply Saint Joseph fix (only after confirming via email)
UPDATE public.users SET school_id = 'fec4f736-ee3f-404f-8a11-3bd6e6bcd7a6'
WHERE id = '5c7f2a9d-392a-4ed1-ac41-fa952bb9b3c1' AND role_key = 'school_admin';
```

Alternative: use the new "Assign an existing admin" dropdown in `/app/super` edit modal (works once frontend changes are deployed).

**Root-cause note for future debugging:** both "no admin shown in super-admin view" AND "admin attendance returns empty" came from the same fault — `users.school_id IS NULL` on the school_admin row. RLS `attendance_select_scope` (in 0014) requires `school_id = current_school_id()` which reads that column. Fixing one fixes the other.

---

## Phase 2 — Feature-permission framework (BUILT 2026-07-01, pending apply+deploy)

Implements the RBAC "features matrix". Effective capabilities = role defaults (`role_features`) UNION per-user additive grants (`user_feature_overrides`); super_admin = implicit all; overrides add-only [D3]; homeroom bumps ride on overrides [D4]; fine-grained `feature.action` keys [D6].

Shipped:
- **`supabase/migrations/0027_feature_permissions.sql`** — tables + `user_can()`/`my_features()` helpers + RLS + seed. Seeds match today's role behavior, so nothing changes until the matrix is edited.
- **`frontend/src/ui/features/FeatureProvider.tsx`** — `FeatureProvider` context + `useFeature()` hook. Loads `my_features()` once, exposes `can(key | key[])`. Wired into `main.tsx` provider stack. Fails closed (empty set) on error.
- **`frontend/src/ui/layout/AppShell.tsx`** — non-super nav now gated by `can(...)` instead of hardcoded role checks. Super-admin nav unchanged + gained a "Feature Matrix" link.
- **`frontend/src/pages/FeatureMatrix.tsx`** + route `/app/features` — super-admin editor for `role_features` (roles × capabilities, grouped, checkbox toggles, optimistic writes). super_admin column shown locked/all. Per-user overrides UI is deferred to Phase 5.
- i18n key `nav.featureMatrix` (en + am).

Non-breaking design note: parent role defaults were intentionally seeded to communication surfaces only (no students/attendance/grades `.view`), so the capability-gated nav matches today's parent nav exactly. Parents' child-scoped access still runs through existing RLS; Phase 5 adds dedicated child-scoped capabilities when it gates those pages.

Verify after apply+deploy: super-admin sees `/app/features`, can toggle a capability, and the change reflects in that role's nav on next load. Confirm admin/teacher/parent navs are unchanged from before.

## Phase 3 — Per-school branding (BUILT 2026-07-01, pending apply+deploy)

Logo + two-color theme + background image/opacity per school, applied AFTER login [D5]. Super-admin edit-school modal exposes all fields so branding is testable on existing schools [D5].

Shipped:
- **`supabase/migrations/0028_school_branding.sql`** — branding columns on `schools`; public `branding` storage bucket; storage.objects write policies (super_admin any; school_admin own `<school_id>/` folder).
- **`frontend/src/ui/branding/BrandingProvider.tsx`** — `useBranding()`; loads the signed-in user's school branding, applies `--primary`/`--primary-600`(derived)/`--accent` inline on `:root` (overrides theme), and renders a fixed faint background-image layer at the configured opacity. Fails safe to defaults; clears vars on unmount/sign-out. Wired into `main.tsx` inside `FeatureProvider`.
- **`frontend/src/ui/layout/AppShell.tsx`** — sidebar logo uses `branding.logoUrl` when set, else `/images/logo.webp`.
- **`frontend/src/pages/SuperAdminDashboard.tsx`** — edit-school modal gained a Branding section: primary/secondary color pickers (+hex + Clear), logo upload (public bucket, live preview), background upload + opacity slider. Saved via the existing `saveSchoolEdits` update. `SchoolRow` + the schools query carry the new columns.

How branding renders: colors are inline CSS vars on `<html>` so they beat the light/dark stylesheet in both themes; the bg image is a `position:fixed; z-index:-1` layer, visible in the transparent `.content` region behind cards (sidebar/panels stay opaque).

Verify after apply+deploy: as super-admin, edit a school → set a primary color + upload a logo/background → Save. Then log in as that school's admin/teacher/parent → sidebar logo, button/accent colors, and faint background reflect the school. Super-admin's own chrome is unbranded (no school_id).

## Phase 4-6 plan (deferred)

Master plan delivered and approved 2026-05-13. Phases 4-6 paused until weekly credits allow. Decisions:

- **D1**: Students stay as roster records only (no login). Add parent notifications to nudge per-student check later.
- **D2**: Stranger login (no invitation) → "Pending approval" screen; admin gets "Pending users" tab to approve.
- **D3**: Per-user overrides can only **add** extras on top of role defaults, never subtract.
- **D4**: Homeroom teachers = a tag, not a new role. Privilege bump via `user_feature_overrides`.
- **D5**: Branding after login for now. Super-admin edit-school modal MUST expose branding fields so user can test on already-created schools. Future: tie to subdomain.
- **D6**: Feature grain is fine: separate view/edit/delete capabilities per feature.

Phase plan: 2 = features framework (schema 0027 + matrix UI + `useFeature` hook + RLS `user_can` helper); 3 = branding (logo, two-color, bg image + opacity); 4 = curriculum editor; 5 = remaining-pages refactor + per-user overrides; 6 = optional student-as-user (only if D1 flips).

See `~/.claude/projects/-Users-eyoel-vibecoding-schoolMS/memory/project_personalization_decisions.md`.

---

## Hard constraints (do not violate)

- **Never `git push`** — user is on Vercel free plan, only one human can push. Give commands instead.
- **No emojis** in code or docs unless user asks.
- Supabase free tier auto-pauses after 7 days inactivity; keep-alive cron is installed.

## Key file map

```
supabase/migrations/
  0025_fix_invite_consumption.sql           ← applied
  0026_fix_admin_reset_password.sql         ← applied
  0027_feature_permissions.sql              ← applied (Phase 2 RBAC framework)
  0028_school_branding.sql                  ← applied (Phase 3 branding + storage bucket)
  0029_staff_reset_password.sql             ← applied (school_admin resets teacher/parent passwords)
  0030_parent_invites_and_pending.sql       ← PENDING (parent invites w/ student links + pending-approval)
frontend/src/pages/Parents.tsx              ← new — admin parent management (/app/parents)
frontend/src/pages/PendingApproval.tsx      ← new — awaiting-approval screen (/app/pending)
frontend/src/pages/
  Attendance.tsx                            ← admin branch added
  SuperAdminDashboard.tsx                   ← assign-existing-admin UI + email-taken guard + branding editor
  FeatureMatrix.tsx                         ← new — super-admin role×capability editor (/app/features)
frontend/src/ui/features/
  FeatureProvider.tsx                       ← new — useFeature() hook (my_features RPC)
frontend/src/ui/branding/
  BrandingProvider.tsx                      ← new — useBranding(); applies school colors/logo/bg
frontend/src/lib/supabaseClient.ts          ← temp client got distinct storageKey
frontend/src/ui/layout/AppShell.tsx         ← nav gated by capability; logo from branding
frontend/ROUTES.md                          ← keep updated when routes change
scripts/
  diagnose_admin_links.sql                  ← orphan-admin investigation
RESUME.md                                   ← this file
```
