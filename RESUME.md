# RESUME — Phase 1 bug fixes (school_admin orphans, attendance, invite link, PW reset)

**Last worked on**: 2026-05-21
**Branch**: `main` (run `git status` before resuming)

Phase 1 of the personalization/RBAC plan is in flight. Phases 2-6 deferred per user (credits). All decisions (D1-D6) are locked in memory at `project_personalization_decisions.md`.

---

## TL;DR — next 3 things to do

0. **Apply migration `0027_feature_permissions.sql`** in Supabase SQL editor (Phase 2 — see below). Non-breaking: seeds reproduce current behavior. After applying, deploy the frontend and the super-admin gets a new "Feature Matrix" nav item at `/app/features`.
1. ~~Apply migration `0026`~~ ✅ DONE (user confirmed 2026-06-29). Both 0025 and 0026 now applied.
2. **Re-link the two orphaned school_admin users** (see "Orphan admin recovery" below). Until they have `school_id` set, the admin attendance view will be empty AND the super-admin edit modal will keep showing "No admin assigned" for their schools.
3. **Smoke test all three fixes** end-to-end: invite a teacher, reset an admin password, log in as a school_admin and load `/app/attendance`.

---

## What was changed this session

### Migrations
| # | File | Applied? | What it does |
|---|---|---|---|
| 0025 | `fix_invite_consumption.sql` | ✅ (user confirmed) | Fixes `ensure_user_profile()` so the `pending_invitations` SELECT bypasses RLS (`SET row_security = off`), and adds a recovery path for users stuck in the legacy `parent / NULL school` state. Teacher invite link now correctly lands on `/app/teacher`. |
| 0026 | `fix_admin_reset_password.sql` | ✅ (user confirmed 2026-06-29) | Adds `extensions` to `search_path` in `admin_reset_password` so `crypt()` and `gen_salt()` resolve. Also adds a `NOT FOUND` check so the RPC errors loudly if the target user doesn't exist. |
| 0027 | `feature_permissions.sql` | ❌ **PENDING** | Phase 2 RBAC framework. Creates `features`, `role_features`, `user_feature_overrides`; adds `user_can(text,uuid)` + `my_features()` SECURITY DEFINER helpers; RLS; seeds the capability catalog and role defaults to reproduce current behavior exactly (non-breaking). |

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

## Phase 3-6 plan (deferred)

Master plan delivered and approved 2026-05-13. Phases 3-6 paused until weekly credits allow. Decisions:

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
  0027_feature_permissions.sql              ← PENDING (Phase 2 RBAC framework)
frontend/src/pages/
  Attendance.tsx                            ← admin branch added
  SuperAdminDashboard.tsx                   ← assign-existing-admin UI + reordered create flow + email-taken guard
  FeatureMatrix.tsx                         ← new — super-admin role×capability editor (/app/features)
frontend/src/ui/features/
  FeatureProvider.tsx                       ← new — useFeature() hook (my_features RPC)
frontend/src/lib/supabaseClient.ts          ← temp client got distinct storageKey
frontend/src/ui/layout/AppShell.tsx         ← nav gated by capability
frontend/ROUTES.md                          ← keep updated when routes change
scripts/
  diagnose_admin_links.sql                  ← orphan-admin investigation
RESUME.md                                   ← this file
```
