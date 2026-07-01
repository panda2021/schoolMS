# Routing & Login Flows

Authoritative map of every route, role-guard, and redirect call. Update this file when you add a route, change `emailRedirectTo`, or touch `RoleRedirect`. The teacher-invite-link bug existed because nobody had written it down.

Last verified: 2026-07-01 against `App.tsx`, `RoleRedirect.tsx`, `ProtectedLayout.tsx`, `AppShell.tsx`, `FeatureProvider.tsx`.

**Nav is now capability-gated** (Phase 2). The sidebar in `AppShell.tsx` renders each non-super item via `useFeature().can('<feature.action>')` instead of hardcoded role checks. Capabilities come from the `my_features()` RPC = role defaults (`role_features`) UNION per-user additive grants (`user_feature_overrides`); super_admin gets the whole catalog. Seeded defaults reproduce the pre-Phase-2 nav exactly. This is UI gating only — pages still enforce their own access; migration 0027's `user_can()` will back domain-table RLS in a later phase.

## Routes

| Path | Component | Auth required? | Role gating |
|---|---|---|---|
| `/` | `pages/Landing` | no | public |
| `/login` | `pages/Login` | no | public |
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

### Flow 3: Parent receives magic link

Identical to Flow 2, but the invitation `role_key` is `parent`, so the RPC writes a `parents` row and `RoleRedirect` lands on `/app/parent`.

### Flow 4: Brand-new auth user (no invitation)

1. Login via OTP — no row in `public.users`, no row in `pending_invitations`.
2. `ensure_user_profile()` falls through to legacy fallback: writes `role='parent', school_id=NULL`.
3. `RoleRedirect` sends them to `/app/parent` — but with no school_id, most pages will be empty.

**Phase 2 (D2):** replace this legacy fallback with `role='pending'` + a "Pending approval" screen, and add a Pending Users tab to the admin dashboard for approval.

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

## Adding a new route — checklist

- Add the `<Route>` in `App.tsx`.
- Add the nav entry in `ui/layout/AppShell.tsx` gated by the appropriate `can('<feature.action>')` (or under the super-admin branch). If the page needs a new capability, add it to migration 0027's `features` catalog + `role_features` seed.
- Add a row to the table at the top of this doc.
- If the page has any role-specific branches, document them in the "Role gating" column.
- If the page is reached from an external link (invite email, password reset link, etc.) — add a Flow section here.
