# PROGRESS LOG — ABOGIDA / FIDEL school management app

Append-only changelog of major steps, newest first. Written so any AI or human
can pick up mid-stream without re-deriving state. For the full handoff
(architecture, decisions, key files) read `RESUME.md` at the repo root FIRST.

Conventions used below:
- "APPLIED?" for migrations means run in the Supabase SQL editor by the user
  (the assistant never has DB write access and never runs `git push`).
- "DEPLOYED?" means the user redeployed the frontend on Vercel.

---

## 2026-07-02 — Session: password resets, parent-model audit, roadmap restart

### Done: parent-student model fix (code complete; 0030 NOT YET APPLIED)
Implements the audit's fixes + decision D2. One migration + 4 frontend surfaces:

- **`supabase/migrations/0030_parent_invites_and_pending.sql`** (NOT YET APPLIED):
  - New role `'pending'` for uninvited sign-ins.
  - `pending_invitations` gains `student_ids uuid[]` + `relation` so a parent
    invite carries the children to auto-link at first login.
  - `ensure_user_profile()` v3: consumes student links on parent invites
    (school-scoped, relation applied); fallback now writes `role='pending'`
    instead of ghost `parent/NULL`; 'pending' users fall through to invitation
    lookup on every call, so late invitations still work.
  - Migrates existing ghost accounts (`parent`, no school, no parents row) to
    'pending' so they surface in the approval queue.
  - `approve_pending_user(user, role, school)` + `reject_pending_user(user)`
    RPCs, super_admin-only. Reject deletes the auth.users row (cascades).
  - `parent_students.relation` CHECK ('mother','father','guardian','other';
    existing junk normalized to 'guardian').
  - Capabilities `parents.view/invite/edit` seeded to school_admin.
- **`frontend/src/pages/Parents.tsx`** (NEW, /app/parents, admin-only): parent
  list with children chips; invite-parent form (email/name/relation + student
  multi-select with search); pending-invitation table with cancel; per-parent
  Manage panel (link/unlink students with relation, reset password via
  `admin_reset_password`).
- **`frontend/src/pages/PendingApproval.tsx`** (NEW, /app/pending): "awaiting
  approval" screen (i18n en+am) + sign out.
- **`frontend/src/ui/auth/RoleRedirect.tsx`**: routes `pending`/unknown roles
  to /app/pending; re-runs `ensure_user_profile()` for pending users and
  legacy parent stubs on every login (invitation retry).
- **`frontend/src/pages/SuperAdminDashboard.tsx`**: "Pending users" card
  (visible only when non-empty) with per-row role+school selects, Approve
  (RPC) and Reject (confirm + RPC).
- **`frontend/src/ui/layout/AppShell.tsx`**: Parents nav item gated by
  `can('parents.view')`. i18n `nav.parents`/`nav.teachers` + `pendingApproval.*`.
- `frontend/ROUTES.md`: routes table updated; Flow 3 (invite parent) and
  Flow 4 (pending approval) rewritten.
- Typecheck + build clean.
- Design note: approval is super_admin-only (not school_admin) because a
  stranger belongs to no school yet — RLS hides school-less users from school
  admins, and only the platform owner can safely decide which school they join.
- USER MUST: apply 0030 in Supabase, deploy, then test (invite a parent with
  students attached; sign in with an uninvited email → pending screen →
  approve from super dashboard).

### Done: migrations 0027 + 0028 applied; orphan admins re-linked (user action)
- User confirmed applying `0027_feature_permissions.sql` (Phase 2 RBAC) and
  `0028_school_branding.sql` (Phase 3 branding) in Supabase.
- User re-linked the two orphaned school_admin rows (Bahir Dar + Saint Joseph)
  so `users.school_id` is set. Admin attendance + edit-school modal unblocked.

### Done: teacher/parent password reset (code complete)
- **`supabase/migrations/0029_staff_reset_password.sql`** (NOT YET APPLIED):
  - Adds capability `users.reset_password` to the Phase 2 features catalog,
    seeded to `school_admin`.
  - Widens `admin_reset_password` RPC: super_admin → anyone;
    `users.reset_password` holders → teachers/parents in their OWN school only.
  - Same RPC name/signature, so the existing super-admin flow is untouched.
- **`frontend/src/pages/Teachers.tsx`**: per-row "Reset password" action for
  active teachers (inline input + Set new password button, calls the RPC).
- **Self-serve forgot-password flow**:
  - `frontend/src/pages/Login.tsx`: "Forgot your password? Send reset link"
    → `supabase.auth.resetPasswordForEmail` → `/reset-password`.
  - `frontend/src/pages/ResetPassword.tsx` (NEW): consumes the recovery-link
    session, lets the user set a new password, redirects to `/app`.
  - `frontend/src/App.tsx`: new public route `/reset-password`.
  - i18n: new `login.*` + `reset.*` keys in `en.ts` and `am.ts`.
  - `frontend/ROUTES.md`: routes table + Flows 7 and 8 added.
- Typecheck (`tsc --noEmit`) and `npm run build` clean.
- USER MUST: apply 0029 in Supabase, deploy frontend, then test
  (see "Pending user actions" below).

### Audit: parent-student model fully mapped (design decision pending)
Full findings live in the session transcript; key facts any future session needs:
- Link chain: `auth.users` → `public.users (role_key='parent')` →
  `public.parents (user_id UNIQUE, school_id NOT NULL)` →
  `parent_students (parent_id, student_id, relation)` → `students`.
  `parent_students` is the ONLY source of truth RLS uses for what a parent sees.
- Students are roster-only records (no login) per decision D1.
- **Gap 1: there is NO "Invite parent" UI.** Teachers.tsx has a full invite
  flow; parents can only be created by manually inserting into
  `pending_invitations` + sending a magic link. This is the root of the
  "parents model doesn't make sense" feeling.
- **Gap 2: fallback ghost accounts.** A user who signs in with no matching
  invitation gets `role='parent', school_id=NULL`, no `parents` row → stuck
  "waiting for school" state, invisible to admin link flows. Decision D2
  (pending-approval screen + admin "Pending users" tab) was made to replace
  this but is NOT yet implemented.
- Gap 3: `students.guardian_name/phone` (migration 0009) is dead denormalized
  data, drifts from the real `parents` link.
- Gap 4: `parent_students.relation` free-text, no constraint.
- Gap 5: students can exist with no parent; parents with no student. No
  orphan-cleanup or admin visibility for either.

### Pending user actions (as of this entry)
1. Apply `0029_staff_reset_password.sql` in Supabase SQL editor.
2. Commit + push (user always pushes, never the assistant), redeploy frontend.
3. Test: super-admin reset of a school-admin password (edit-school modal),
   school-admin reset of a teacher password (/app/teachers), forgot-password
   email flow from /login.
4. Verify 0027/0028 features: /app/features matrix loads and toggles; branding
   section in edit-school modal saves and shows for that school's users.

---

## 2026-07-01 — Phases 2 and 3 built (previous session)

- `0027_feature_permissions.sql` — features/role_features/user_feature_overrides
  tables, `user_can()` + `my_features()` helpers, seeds matching current
  behavior. FeatureProvider + useFeature hook, FeatureMatrix page
  (/app/features), AppShell nav gated by capabilities.
- `0028_school_branding.sql` — branding columns on schools, public `branding`
  storage bucket + policies. BrandingProvider applies per-school colors/logo/bg
  after login; edit-school modal gained a Branding section.
- Commits: `a9f4a0f` (Phase 2), `0bdc7ea` (Phase 3), `020ff52` (admin-creation
  email-taken fix).

## 2026-05-13 → 2026-06-29 — Phase 1 (previous sessions)

- `0025_fix_invite_consumption.sql` (applied): teacher invite consumption RLS
  bypass + stuck-user recovery.
- `0026_fix_admin_reset_password.sql` (applied 2026-06-29): pgcrypto
  search_path fix so super-admin password reset actually works.
- Admin attendance view built into Attendance.tsx; assign-existing-admin flow
  in SuperAdminDashboard; `frontend/ROUTES.md` created.
- Master plan decisions D1-D6 locked (see RESUME.md "Phase 4-6 plan").
