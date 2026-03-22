# ABOGIDA (FIDEL) - Project Context

Single source of truth for architecture, schema, decisions, and changes. This file must be updated with every meaningful change.

- Project: ABOGIDA (FIDEL)
- Purpose: Mobile-first early education platform connecting schools, teachers, and parents
- MVP Focus: Attendance, Daily Updates, Messaging, Progress Reports, Announcements, Auth/RBAC, Multi-language (English/Amharic)
- Backend: Supabase (Auth, Postgres, Storage, RLS)
- Frontend: React/React Native (TypeScript)
- Current Time (local): 2026-01-11T21:05:35+03:00

## Operating Principles
- Prioritize simplicity, clarity, maintainability, speed to MVP
- Supabase-native best practices; no custom server unless unavoidable
- Strict security and RLS; least-privilege access
- Every table, endpoint, decision logged here

## Architecture Overview (MVP)
- Client App (React/React Native TypeScript)
  - Supabase JS client for auth, database, storage
  - Feature modules: Attendance, Updates Feed, Messaging, Reports, Announcements
  - Mobile-first UI, minimal teacher workflows, feed experience for parents
- Supabase Backend
  - Auth: Supabase Auth, single account per user
  - DB: PostgreSQL with normalized schema, foreign keys, soft-deletes
  - RLS: Enforce per-role and per-tenant (school) isolation
  - Storage: Buckets for media uploads (images/videos)
  - Edge Functions: Optional for future advanced use; not used initially
- Tenancy Model
  - School-scoped data isolation. Each record is bound to a `school_id` where applicable
  - Users are linked to `auth.users` via `users.id` (UUID)

## Entities and Relationships (High-level)
- Users & Roles
  - `users` extends `auth.users` with profile, role, language, school assignment (where applicable)
  - `roles` lookup table enumerates: `school_admin`, `teacher`, `parent`
- Schools
  - `schools` manages institution metadata
- Teachers & Parents
  - `teachers` and `parents` reference `users`
- Students & Classes
  - `stude  nts` belong to a `school`, can be enrolled in many `classes` via `enrollments`
  - `classes` belong to `school`, assigned to a `teacher`
- Attendance
  - `attendance` tracks per-student daily presence
- Updates/Feed
  - `daily_updates` by teachers per class (text + optional media)
  - `media_assets` store links to storage objects and relate to updates/reports/announcements
- Messaging
  - `messages` are one-to-one between parent and teacher, scoped to a `student` OR a `class`
- Progress Reports
  - `progress_reports` uploaded by teachers for students
- Announcements
  - `announcements` school-wide or class-level; read-only for parents

## Initial Database Schema Summary
Tables to create (see `supabase/migrations/0001_initial_abogida.sql` for DDL):
- roles
- users (extends auth.users)
- schools
- teachers
- parents
- students
- classes
- enrollments
- attendance
- daily_updates
- messages
- progress_reports
- announcements
- media_assets
- parent_students (join table for parents linked to multiple students)

Common columns:
- id (ULID-like UUID via gen_random_uuid())
- created_at (timestamptz default now())
- updated_at (timestamptz default now()) via trigger
- deleted_at (soft-delete nullable timestamptz)
- school_id where applicable for isolation

Notes:
- Media references use dedicated nullable FKs per owning table to avoid unsafe polymorphic FKs
- Messages enforce either student_id OR class_id via CHECK constraint

## RLS Strategy (Implemented in migration 0002)
- RLS enabled on all tables. See `supabase/migrations/0002_rls_policies.sql`
- Helper functions: `current_user_id()`, `user_school_id()`, `user_role()`, `is_school_admin()`, `is_teacher()`, `is_parent()`, `get_teacher_id()`, `get_parent_id()`
- Scoped access
  - Parents: only linked students and related attendance, enrollments, classes, progress reports, updates, announcements, messages
  - Teachers: only assigned classes and their students; can post updates, attendance, reports
  - School Admins: full read/write within their school
- Soft-deletes: policies assume `deleted_at is null` by consumer queries; views can enforce this later

## Storage Strategy (Implemented in migration 0003)
- Bucket: `media` (private) for images/videos; file size limit 50MB; allowed types image/*, video/*
- Object keys namespaced by school and entity: `school_{id}/{entity}/{record_id}/{filename}` (convention; not enforced by DB)
- Access via signed URLs; public read disabled. RLS on `storage.objects` ties access to `media_assets` and user school.
- Insert/Delete allowed for teachers and admins; parents have read via corresponding `media_assets` rows

## Internationalization
- `users.language_preference`: `en` | `am`
- UI labels/strings locale-driven client-side; server stores raw content as posted

## Frontend Scaffold (Vite + React + TypeScript)
- Location: `frontend/`
- Key files:
  - `frontend/package.json` (scripts: dev/build/preview)
  - `frontend/vite.config.ts` (React plugin)
  - `frontend/tsconfig.json` (path aliases `@/`)
  - `frontend/index.html`
  - `frontend/src/lib/supabaseClient.ts` (reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
  - `frontend/src/App.tsx` (auth guard, routing)
  - `frontend/src/pages/Login.tsx` (password + magic link auth)
  - `frontend/src/pages/Dashboard.tsx` (basic profile display)
  - `frontend/src/pages/Attendance.tsx` (teacher view: class pick + daily save)
  - `.env.example`
- Notes:
  - Minimal styles inline for MVP
  - Attendance uses `upsert` with onConflict `(class_id,student_id,date)` per schema
  - Routing via `react-router-dom`

## Assumptions
- One school per user context for MVP; multi-school admins possible later
- Videos are short-form; large media constraints enforced in client (e.g., <50MB)
- No group chat in MVP; only parent-teacher pairs
- Term/semester is a free-text label stored in progress reports for MVP

## Change Log
- 2026-01-11 Step 1
  - Created `PROJECT_CONTEXT.md` as the central persistent context file
  - Added architecture overview, entities, schema summary, RLS and storage strategies, assumptions
  - Created initial migration `supabase/migrations/0001_initial_abogida.sql` with all MVP tables, relationships, timestamps, and soft-deletes
  - Why: Establish a secure, normalized foundation aligned with MVP scope and Supabase best practices
  - Tradeoffs: Avoided polymorphic FKs by using dedicated nullable FKs in `media_assets`; limited initial constraints to ease iteration; RLS to be implemented next

- 2026-01-11 Step 2
  - Implemented RLS helper functions and policies in `supabase/migrations/0002_rls_policies.sql`
  - Functions include role and scope helpers (`user_school_id`, `user_role`, `get_teacher_id`, `get_parent_id`)
  - Policies enforce per-role, per-school isolation across users, teachers, parents, students, classes, enrollments, attendance, daily updates, messages, progress reports, announcements, and media assets
  - Why: Enforce strict least-privilege access for a children-focused platform; ensure parents only see their children, teachers see assigned classes, admins see school data
  - Tradeoffs: Parents cannot upload media in MVP; announcements allow school-wide visibility by setting `class_id is null`; soft-deletes not explicitly filtered in policies to keep queries flexible (client should filter `deleted_at is null`)

- 2026-01-11 Step 3
  - Created private `media` storage bucket and storage RLS policies in `supabase/migrations/0003_storage_setup.sql`
  - Select allowed only if a matching `media_assets` row exists in the same school; insert/delete allowed for teachers/admins
  - Why: Prevent unauthorized media access and ensure all media is referenced in DB for auditing
  - Tradeoffs: Naming convention not enforced at DB level; rely on app to prefix object paths by school/entity

- 2026-01-11 Step 4
  - Scaffolded frontend app in `frontend/` with Vite + React + TS
  - Integrated Supabase client and basic auth flow; added Dashboard and Attendance MVP pages
  - Why: Establish mobile-first client foundation and verify RLS-compatible queries
  - Tradeoffs: Minimal UI; feature pages (Updates, Messages, Reports, Announcements) to be implemented iteratively

- 2026-01-12 Step 5
  - Fixed storage migration: removed `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` from `0003_storage_setup.sql`
  - Reason: Supabase manages `storage.objects` ownership; attempting to ALTER fails with `must be owner of table objects (SQLSTATE 42501)`
  - Impact: No functional change to storage policies; policies still apply as expected under Supabase-managed RLS

- 2026-01-12 Step 6
  - Frontend fixes:
    - Added Vite `resolve.alias` mapping `@` -> `src` in `frontend/vite.config.ts` to align with TS path aliases and fix import resolution
    - Updated `frontend/src/pages/Attendance.tsx` to include `school_id` and `created_by` (teacher_id) in attendance upsert to satisfy schema and RLS
  - Why: Resolve build error from path alias and ensure attendance writes pass RLS and constraints

- 2026-01-12 Step 7
  - Added explicit environment validation in `frontend/src/lib/supabaseClient.ts` to require `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Why: Prevent cryptic runtime error and white screen when env is missing; guide developer with clear message

- 2026-01-12 Step 8
  - Adopted `.env.local` for local secrets. Reverted `frontend/.env.example` to placeholders and added `frontend/.gitignore` to ignore env files except the example
  - Why: Prevent accidental secret leaks and follow Vite convention (`.env.local` is loaded automatically and not committed)

- 2026-01-12 Step 9
  - Added migration `supabase/migrations/0004_fix_rls_definer.sql` to fix 500 errors from PostgREST due to RLS recursion
  - Changes:
    - Marked RLS helper functions as `SECURITY DEFINER` and set `search_path = public`
    - Added `is_in_same_school(target_user_id)` helper
    - Replaced `users` table policies to use helpers and avoid self-referential lookups under RLS
  - Why: Queries to `public.users`, `teachers`, and `daily_updates` returned 500 because helper functions were executed under RLS and re-queried protected tables
  - Impact: Stabilized RLS evaluation; authenticated users can read their own user row and admins see users in their school; other policies continue to work with definer helpers

- 2026-01-12 Step 10
  - Added migration `supabase/migrations/0005_stabilize_teacher_class_update_rls.sql`
  - Changes:
    - Introduced definer helpers: `current_school_id()` and `current_teacher_id()`
    - Simplified SELECT policies:
      - `teachers`: self-only by `user_id = auth.uid()`
      - `classes`: `school_id = current_school_id()`
      - `daily_updates`: `teacher_id = current_teacher_id()`
  - Why: Break cross-table policy dependencies to eliminate remaining 500s for `/teachers`, `/classes`, `/daily_updates`
  - Impact: Read paths are stabilized; writes remain governed by prior insert/update policies

- 2026-01-12 Step 11
  - UI polish and navigation
  - Changes:
    - Added global styles at `frontend/src/styles.css` and imported in `frontend/src/main.tsx`
    - Modernized shell/header in `frontend/src/App.tsx` (brand/logo, nav)
    - Upgraded `frontend/src/pages/Dashboard.tsx` quick links into clickable cards
    - Added routes and placeholder pages: `Messages`, `Reports`, `Announcements`
  - Why: Improve UX and provide clear navigation targets for MVP features
  - Impact: Dashboard now uses modern styling; quick links navigate to feature routes

- 2026-01-12 Step 12
  - Dev server tunneling compatibility (LocalTunnel)
  - Changes: Updated `frontend/vite.config.ts` to support reverse proxy tunnels
    - `server.host = '0.0.0.0'`, `strictPort`, `cors: true`, `allowedHosts: true`
    - HMR forced to `wss` with `clientPort: 443` and no pinned host (auto-detect origin)
  - Why: Prevent 400/HMR issues and avoid editing env when tunnel URL changes
  - Impact: External URLs via localtunnel/ngrok should work with live reload without changing env

- 2026-01-13 Step 13
  - Added demo seed data under `supabase/seeds/`
  - Files:
    - `supabase/seeds/001_demo_data.sql` — realistic data for schools, users, teachers, parents, students, classes, enrollments, attendance (last 3 days), daily_updates, announcements, progress_reports, messages, media_assets references
    - `supabase/seeds/README.md` — instructions and placeholders for auth user IDs
  - Why: Enable comprehensive end-to-end testing with meaningful, business-logic-aligned demo data
  - Tradeoffs: Media assets only reference storage paths; no actual file objects uploaded by seed

## Next Steps
- Configure Supabase Storage bucket and rules
- Initialize frontend app scaffold and Supabase client integration
- Build features incrementally: Auth/RBAC -> Attendance -> Updates -> Messaging -> Reports -> Announcements

### 2026-01-15 Step 14
- Captured current Supabase ground truth (from user):
  - Auth users: 5
  - `public.users`: only Martha present; `teachers`: contains Martha; `parents`: empty; `classes`: partial
- Added targeted sync SQL at `supabase/seeds/002_sync_progress.sql` aligned with provided UIDs and school id
- Purpose: deterministically populate `public.users`, `teachers`, `parents`, `classes`, `students`, and `enrollments` with idempotent upserts
- Why: Establish a clean, minimal baseline for app testing that matches live Auth users

### 2026-01-15 Step 15 (Next Actions)
- Run seeds in order to complete data population for testing:
  1) `supabase/seeds/002_sync_progress_filled.sql` (uses provided UIDs and school_id to upsert users/teachers/parents/classes/students/enrollments)
  2) `supabase/seeds/003_fill_remaining.sql` (links parents to students, adds attendance for recent days, daily updates, announcements, progress reports, messages, and media asset references)
- After seeding, verify RLS and app reads via REST/UI:
  - `/classes?select=id,name` should be 200
  - `/daily_updates` should list seeded updates (200)
  - Teacher account: Attendance page lists classes and can save
  - Parent account: Can view children data (attendance, updates, announcements, reports)
- Frontend implementation sequence:
  - Updates: add media upload (images/videos) with signed URLs and `media_assets` linkage
  - Messages: 1:1 parent-teacher UI with thread list and composer (scoped by student/class)
  - Progress Reports: upload form + history list
  - Announcements: creation form (teacher/admin) + list (parents read-only)
  - Language toggle (EN/AM) honoring `users.language_preference`
- Testing checklist (concise):
  - Admin reads school users/classes (same school)
  - Teacher creates attendance, daily updates (+media)
  - Parent sees only their linked students and related data
  - Storage downloads only for DB-referenced media within same school

### 2026-01-15 Step 16
- Simplified dev workflow to local-only and removed tunnel-specific configuration
- Changes:
  - Updated `frontend/vite.config.ts` to default local settings only (no `allowedHosts`, no forced `wss` HMR)
  - Dev server now runs at `http://localhost:5173` with default websocket HMR
  - `VITE_TUNNEL_HOST` no longer needed; `.env.local` can omit it
- Why: User prefers local-only development; avoids reload loops and tunnel-related noise
- Impact: Run `npm run dev` from `frontend/` and use `http://localhost:5173`

### 2026-02-22 Step 17
- Fixed Vercel deployment configuration and asset serving issues
- Issues encountered:
  - Vercel build failed due to invalid `root` property in `vercel.json`
  - When accessing `/frontend` URL, site loaded but static assets (JS, CSS, favicon) returned 404
- Changes made to `vercel.json`:
  - Removed invalid `root` property (not supported in Vercel v2)
  - Updated `builds.src` to point to `frontend/package.json`
  - Updated routing to serve all requests from `/frontend/dist/$1` to correctly handle static assets
- Why: Fix deployment issues and ensure proper asset loading for production deployment
- Impact: Vercel should now build and serve the React app correctly from the frontend subdirectory
- Committed changes to GitHub for deployment

### 2026-02-22 Step 18
- Fixed Vercel builder configuration error
- Issue: Vercel build failed with "The package `@vitejs/vite` is not published on the npm registry"
- Change: Updated `vercel.json` to use `"use": "vite"` instead of `"@vitejs/vite"` for the builder
- Why: `@vitejs/vite` is not a valid Vercel builder; the correct value is `"vite"`
- Impact: Vercel should now be able to install and use the Vite builder for deployment
- Committed and pushed fix to GitHub

### 2026-02-22 Step 19
- Configured Vercel root directory and updated deployment settings
- User action: Set Vercel project root directory to `frontend` in Vercel dashboard
- Change: Updated `vercel.json` to work with frontend as root directory:
  - Changed `builds.src` from `"frontend/package.json"` to `"package.json"`
  - Simplified routes to serve from `/$1` instead of `/frontend/dist/$1`
- Why: Vercel was unable to resolve entry module "index.html" because build was not running from correct directory
- Impact: Vite build should now find index.html and build successfully with frontend as root
- Committed and pushed configuration update to GitHub

### 2026-02-22 Step 20
- Cleaned up environment configuration for scalability and environment-awareness
- Audit results:
  - No hardcoded URLs found in code (only documentation comments)
  - Supabase client already properly using environment variables with error handling
  - Authentication redirects already dynamic using `window.location.origin`
- Changes made:
  - Added `VITE_API_URL` placeholder to `.env.local` for future API scalability
  - Verified Supabase client centralized in `frontend/src/lib/supabaseClient.ts`
  - Confirmed Vite config properly handles environment variables
- Why: Ensure app is environment-aware and scalable across different deployments
- Impact: Configuration is now ready for production with proper environment variable management
- User manually updated `.env.local` with `VITE_API_URL=`

### 2026-02-22 Step 21
- Fixed SPA routing issue for Vercel deployment
- Issue: Supabase magic link redirected to production URL, but Vercel returned 404 for `/app` route because SPA routes aren't real server paths
- Change: Updated `vercel.json` to use `"rewrites"` instead of `"routes"` to send all requests to `/index.html` for client-side routing
- Why: Enable proper Single Page Application routing where JavaScript handles route navigation
- Impact: Direct links to app routes (like `/app` from Supabase redirects) will now load the app correctly
- Committed and pushed configuration update to GitHub

### 2026-02-22 Step 22
- Fixed SPA rewrites destination path for Vercel
- Issue: Rewrites were pointing to `/index.html` but with frontend root directory, built files are in `/dist/index.html`
- Change: Updated rewrites destination from `/index.html` to `/dist/index.html`
- Why: Correct the path to the actual built index.html file location
- Impact: SPA routing should now work correctly, allowing `/app` and other routes to load without 404
- Committed and pushed fix to GitHub

### 2026-02-22 Step 23
- Corrected SPA rewrites destination for frontend root setup
- Issue: Previous `/dist/index.html` path was incorrect for Vercel frontend root configuration
- Change: Simplified rewrites destination back to `/index.html` (no dist prefix needed)
- Why: With root directory set to frontend in Vercel dashboard, `/index.html` correctly points to the built file
- Impact: SPA routing should now work properly for `/app` and other client-side routes
- Committed and pushed correction to GitHub

### 2026-03-22 Step 24
- Moved vercel.json into frontend/ directory (Vercel root dir is frontend/)
- Fixed Vercel-GitHub integration reconnection
- Created test user accounts (admin@admin.com, teacher@test.com, parent1@test.com, parent2@test.com) with password login
- Seeded database with school, users, teachers, parents, students, classes, enrollments via SQL

### 2026-03-22 Step 25 — Complete MVP Build
- Built all remaining MVP features:
  - **Admin CRUD**: Classes (create/edit/delete + teacher assignment), Students (create/edit/delete), Enrollment management (inline in Classes page)
  - **Dashboard Upgrades**: Admin (stats, quick actions, teachers/parents tables, recent activity), Teacher (stats, my classes, attendance nudge), Parent (children cards, today's attendance, recent updates, announcements preview)
  - **Announcements**: Create form (admin/teacher), feed with pagination, school-wide or class-scoped, soft-delete
  - **Messages**: Two-panel parent-teacher chat, conversation list + thread, sender identification
  - **Progress Reports**: Teacher creates with metrics (Reading/Writing/Math/Social Skills/Behavior), parent views with colored badges
- Polish: Mobile hamburger nav, deleted_at filters across all queries, cols-4 grid class
- RLS migration 0006: Fixed teachers SELECT policy to allow same-school reads
- Migration 0007: Changed announcements.created_by FK to users(id) for admin posting
- Migration 0008: Added sender_id to messages table

### 2026-03-22 Step 26 — UX Improvements & Business Logic
- **Schema enhancement** (migration 0009): Added gender, guardian_name, guardian_phone, emergency_contact, medical_notes columns to students table
- **Enhanced Student Form**: Expanded from 3 fields to full form with Student Info section + Guardian & Emergency section. Click-to-expand detail rows in table.
- **Parent-Student Linking**: Admin can link/unlink parents to students from Admin Dashboard with relation type (mother/father/guardian)
- **Excel/CSV Bulk Import**: New BulkImport page at /app/import. Upload Excel/CSV for students or classes. Client-side parsing (xlsx/SheetJS), preview table, validation, batch import. Download template buttons. Auto-enrollment by class_name column.
- **Quick Enroll Wizard**: Modal-based multi-step workflow — Student Info → Class Selection → Parent Link → Review & Confirm. Available from Admin Dashboard and Students page.
- **Parent Attendance View**: Parents can now see attendance history for their children with summary stats (present/absent/late counts) and detailed table
- **Admin Message View**: Admin can view all school messages in read-only mode (conversation list + thread, no send capability)
- New reusable components: Modal.tsx, QuickEnrollWizard.tsx
- New CSS: dropzone, tabs, modal overlay, step indicator
- New dependency: xlsx (SheetJS) for Excel parsing
