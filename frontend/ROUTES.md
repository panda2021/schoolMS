# Routing & Login Flows

Authoritative map of every route, role-guard, and redirect call. Update this file when you add a route, change `emailRedirectTo`, or touch `RoleRedirect`. The teacher-invite-link bug existed because nobody had written it down.

Last verified: 2026-07-01 against `App.tsx`, `RoleRedirect.tsx`, `ProtectedLayout.tsx`, `AppShell.tsx`, `FeatureProvider.tsx`.

**Nav is now capability-gated** (Phase 2). The sidebar in `AppShell.tsx` renders each non-super item via `useFeature().can('<feature.action>')` instead of hardcoded role checks. Capabilities come from the `my_features()` RPC = role defaults (`role_features`) UNION per-user additive grants (`user_feature_overrides`); super_admin gets the whole catalog. Seeded defaults reproduce the pre-Phase-2 nav exactly. This is UI gating only — pages still enforce their own access; migration 0027's `user_can()` will back domain-table RLS in a later phase.

## Routes

| Path | Component | Auth required? | Role gating |
|---|---|---|---|
| `/` | `pages/Landing` | no | public |
| `/login` | `pages/Login` | no | public |
| `/reset-password` | `pages/ResetPassword` | no* | public route, but the form only works with the temporary session from a Supabase recovery link (`resetPasswordForEmail` → email → here). Without one it shows "invalid/expired link". |
| `/app` (parent) | `ui/auth/ProtectedLayout` | **yes** | wraps all `/app/*` children with `RequireAuth` + `AppShell` |
| `/app` (index) | `ui/auth/RoleRedirect` | yes | redirects to role-specific dashboard — see flow below |
| `/app/super` | `pages/SuperAdminDashboard` | yes | **no route guard**; page-level role check inside component |
| `/app/features` | `pages/FeatureMatrix` | yes | page-level super_admin check; edits `role_features` default matrix |
| `/app/admin` | `pages/AdminDashboard` | yes | no route guard; page-level check |
| `/app/teacher` | `pages/TeacherDashboard` | yes | no route guard; page-level check |
| `/app/parent` | `pages/ParentDashboard` | yes | no route guard; page-level check |
| `/app/classes` | `pages/Classes` | yes | page-level; admin + teacher |
| `/app/students` | `pages/Students` | yes | page-level; admin sees all, teacher sees own classes |
| `/app/attendance` | `pages/Attendance` | yes | branches by role inside the page: teacher (take roll), parent (child history), admin (all-school view with filters), other (helper text) |
| `/app/updates` | `pages/Updates` | yes | feed visible to admin/teacher/parent; teacher can post |
| `/app/announcements` | `pages/Announcements` | yes | admin/teacher post; parent reads |
| `/app/messages` | `pages/Messages` | yes | admin/teacher/parent participants |
| `/app/reports` | `pages/Reports` | yes | teacher creates, parent reads |
| `/app/grades` | `pages/Grades` | yes | teacher enters, admin views |
| `/app/report-cards` | `pages/ReportCards` | yes | admin-only render |
| `/app/search` | `pages/Search` | yes | super_admin global, admin school-only, teacher own-class only |
| `/app/import` | `pages/BulkImport` | yes | admin-only |
| `/app/teachers` | `pages/Teachers` | yes | admin-only |
| `/app/parents` | `pages/Parents` | yes | admin-only; invite parents (with student links), manage parent-student links, reset parent passwords |
| `/app/pending` | `pages/PendingApproval` | yes | shown to `role='pending'` users (uninvited sign-ins, D2); just an info screen + sign out |
| `/app/helpdesk` | `pages/Helpdesk` | yes | anyone opens own tickets; super_admin sees all |
| `/app/settings` | `pages/Settings` | yes | personal prefs for all; admin sees curriculum/assessments |
| `*` (anything else) | redirect to `/` | n/a | n/a |

**Route-level guards do not exist** — every `/app/*` page is reachable for any authenticated user. Each page must enforce role internally. If you add a new page, do not rely on the route alone.

## Redirect calls (greps for `navigate(`, `emailRedirectTo`, `Navigate to=`)

| File:line | Call | Target | Triggered by |
|---|---|---|---|
| `App.tsx:57` | `<Navigate to="/" replace />` | `/` | unknown route |
| `ui/auth/ProtectedLayout.tsx` | `navigate('/login')` | `/login` | no session |
| `ui/auth/RoleRedirect.tsx:11` | `navigate('/login', { replace })` | `/login` | no auth user |
| `ui/auth/RoleRedirect.tsx:27` | `navigate('/app/super')` | super_admin dashboard | role match |
| `ui/auth/RoleRedirect.tsx:28` | `navigate('/app/admin')` | school_admin dashboard | role match |
| `ui/auth/RoleRedirect.tsx:29` | `navigate('/app/teacher')` | teacher dashboard | role match |
| `ui/auth/RoleRedirect.tsx:30` | `navigate('/app/parent')` | parent dashboard | role match |
| `ui/auth/RoleRedirect.tsx:31` | `navigate('/app/parent')` | parent dashboard | **fallback** when role is empty or unknown |
| `pages/Login.tsx` | `navigate('/app')` | `/app` (→ RoleRedirect) | successful login |
| `pages/Login.tsx` (`forgotPassword`) | `resetPasswordForEmail({ redirectTo: '${origin}/reset-password' })` | `/reset-password` | user clicks "Send reset link" |
| `pages/ResetPassword.tsx` | `navigate('/app', { replace })` | `/app` (→ RoleRedirect) | password updated successfully |
| `pages/Teachers.tsx` (`inviteTeacher`) | `signInWithOtp({ emailRedirectTo: '${origin}/app' })` | `/app` (→ RoleRedirect) | admin sends teacher invite |
| `pages/SuperAdminDashboard.tsx` (`createSchool`) | server-side create + redirect after success | local refresh | super-admin creates new school |

## End-to-end flows

### Flow 1: Existing user signs in

1. User submits credentials at `/login`.
2. Supabase Auth returns a session.
3. `Login.tsx` calls `navigate('/app')`.
4. `ProtectedLayout` confirms session, renders `<Outlet />`.
5. `/app` index route mounts `RoleRedirect`.
6. `RoleRedirect` queries `public.users.role_key`. If present, redirects to role dashboard.
7. If `role_key` is missing, calls RPC `ensure_user_profile()` (see migration 0025) and uses its return.

### Flow 2: Admin invites a teacher

1. Admin opens `/app/teachers`, enters teacher email + name.
2. Frontend INSERT into `public.pending_invitations` with `role_key='teacher'`.
3. Frontend calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '${origin}/app' } })`.
4. Supabase emails a magic link.
5. Teacher clicks link → lands on `/app`.
6. `ProtectedLayout` accepts session, mounts `RoleRedirect`.
7. `RoleRedirect` queries `users.role_key` → empty for new user → calls `ensure_user_profile()` RPC.
8. **The RPC (post-migration 0025) bypasses RLS internally, finds the pending invitation by email, sets `users.role_key='teacher'` + `users.school_id`, inserts a `teachers` row, marks the invitation consumed.**
9. RPC returns `{ role: 'teacher', school_id }`.
10. `RoleRedirect` navigates to `/app/teacher`.

**Historic bug (fixed in 0025):** the RPC's `pending_invitations` SELECT was blocked by RLS even inside `SECURITY DEFINER`, so the lookup returned zero rows. The function fell through to the default branch and wrote `role='parent'`, sending the teacher to `/app/parent` forever. Fix: `SET row_security = off` on the function; recovery path also rewrites stuck `parent / NULL school` stubs.

### Flow 3: Admin invites a parent (post-migration 0030)

1. Admin opens `/app/parents`, enters parent email + name, picks a relation and the student(s) to link.
2. Frontend INSERT into `pending_invitations` with `role_key='parent'`, `student_ids uuid[]`, `relation`.
3. Magic link is sent exactly like Flow 2.
4. On first login, `ensure_user_profile()` (0030) consumes the invitation: writes `users` row, `parents` row, AND `parent_students` rows for every student on the invitation that belongs to the inviting school. Relation comes from the invitation.
5. `RoleRedirect` lands on `/app/parent`, and the parent immediately sees their children.

### Flow 4: Brand-new auth user (no invitation) — pending approval (D2, post-0030)

1. Login via OTP or password — no row in `public.users`, no row in `pending_invitations`.
2. `ensure_user_profile()` writes `role='pending', school_id=NULL`.
3. `RoleRedirect` sends them to `/app/pending` (`pages/PendingApproval.tsx`) — a friendly "awaiting approval" screen with sign-out. Their nav is empty ('pending' has no capabilities).
4. The user appears in the super-admin dashboard "Pending users" card. Super-admin picks a role + school and calls `approve_pending_user` RPC (creates `teachers`/`parents` row as needed), or `reject_pending_user` (deletes the auth account entirely).
5. On the user's next login/refresh, `RoleRedirect` sees the real role and routes normally. `RoleRedirect` also re-runs `ensure_user_profile()` for 'pending' users on every login, so an invitation created AFTER their first sign-in is consumed automatically.

**History:** before 0030 the fallback wrote `role='parent', school_id=NULL` — a ghost account stuck on an empty parent dashboard, invisible to admin flows. 0030 migrates those ghosts to 'pending' so they surface in the approval queue.

### Flow 5: Super-admin creates a school + initial admin

1. Super-admin opens `/app/super`, fills out create-school modal.
2. Frontend INSERTs `schools` row, then INSERTs a `users` row with `role_key='school_admin'` and the new `school_id`.
3. Frontend either sets an initial password via `admin_reset_password` RPC (post-migration 0026) or sends a magic link.
4. The new admin signs in at `/login` and lands on `/app/admin` via Flow 1.

### Flow 6: Super-admin resets a school admin's password

1. Super-admin opens `/app/super`, edits a school, clicks "Reset password" with a new value.
2. Frontend calls `supabase.rpc('admin_reset_password', { target_user_id, new_password })`.
3. RPC (post-migration 0026) writes `auth.users.encrypted_password = crypt(new_password, gen_salt('bf'))`.

**Historic bug (fixed in 0026):** the RPC's `search_path` was `public` only, so `crypt`/`gen_salt` from pgcrypto (which lives in `extensions`) was unresolvable. The frontend showed a success toast because the RPC's `void` return masked the error. Fix: extend `search_path` to `public, extensions`.

### Flow 7: School admin resets a teacher's password (post-migration 0029)

1. School admin opens `/app/teachers`, clicks "Reset password" on an active teacher row.
2. Inline input appears; admin types a new password (min 6 chars) and confirms.
3. Frontend calls the same `supabase.rpc('admin_reset_password', ...)` RPC.
4. RPC guard (0029): super_admin → any user; holder of `users.reset_password` capability (school_admin by default) → teachers/parents in their own school only. Everyone else rejected.

### Flow 8: Self-serve "Forgot password"

1. On `/login` (password tab), user enters their email and clicks "Send reset link".
2. Frontend calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${origin}/reset-password' })`.
3. Supabase emails a recovery link; clicking it opens `/reset-password` with a temporary session.
4. `pages/ResetPassword.tsx` lets the user set a new password via `supabase.auth.updateUser({ password })`, then navigates to `/app` (→ RoleRedirect).
5. If the page is opened without a recovery session (expired/invalid link), it shows an error + link back to `/login`.

## Adding a new route — checklist

- Add the `<Route>` in `App.tsx`.
- Add the nav entry in `ui/layout/AppShell.tsx` gated by the appropriate `can('<feature.action>')` (or under the super-admin branch). If the page needs a new capability, add it to migration 0027's `features` catalog + `role_features` seed.
- Add a row to the table at the top of this doc.
- If the page has any role-specific branches, document them in the "Role gating" column.
- If the page is reached from an external link (invite email, password reset link, etc.) — add a Flow section here.
