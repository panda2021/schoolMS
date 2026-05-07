# Abogida QA Checklist (Step 31 fixes)

Walk through every item per role. Each row is a discrete check — mark ✅ or ❌ with a note.

> **Tip**: open four browser windows / Incognito sessions, one per role. Pre-seed accounts:
> - super admin (founder)
> - school_admin (admin@admin.com)
> - teacher (teacher@test.com)
> - parent (parent1@test.com)

## Pre-flight (database)

| # | Check | How | OK? |
|---|---|---|---|
| 0.1 | Migrations 0017-0023 applied | `select max(version) from supabase_migrations.schema_migrations` should be ≥ `0023` | ☐ |
| 0.2 | DB smoke passes | `bash scripts/smoke_db.sh` returns 0 | ☐ |

## A. Critical bug fixes

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| A.1 | any | Open `/app/announcements` | No 42P17 error. Page renders, even if empty | ☐ |
| A.2 | parent | Attach a file in any chat thread | Upload succeeds, image preview shows in thread | ☐ |
| A.3 | teacher | Try to take attendance for a class+date that already has it | Form is read-only, "Already taken" banner shows, "Edit attendance" button visible | ☐ |
| A.4 | teacher | Click "Edit attendance" then change a status and Save | "Attendance updated" toast, value persists on reload | ☐ |
| A.5 | parent | Open `/app/messages`, attach button | Paperclip icon is **next to** Send (not below) | ☐ |
| A.6 | admin | Open Announcements → New → Specific parents | Each option shows the parent's name OR email OR "Parent of [child]" — no "Unknown parent" | ☐ |

## B. Visibility & RBAC

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| B.1 | parent | Inspect sidebar | Visible: Dashboard, Updates, Announcements, Messages, Reports, Helpdesk, Settings. NOT visible: Classes, Students, Attendance, Bulk Import, Grades, Search | ☐ |
| B.2 | teacher | Inspect sidebar | Visible: Dashboard, Classes, Students, Attendance, Updates, Announcements, Messages, Reports, Grades, Helpdesk, Settings. NOT visible: Bulk Import, Report Cards, Teachers (admin) | ☐ |
| B.3 | admin | Inspect sidebar | Visible: Dashboard + everything teacher has + Report Cards, Teachers, Bulk Import. | ☐ |
| B.4 | parent | Open ParentDashboard / Updates feed | Only daily updates from classes the user's children are enrolled in. Updates for unrelated classes do NOT show | ☐ |
| B.5 | teacher | Open Students | List shows ONLY students enrolled in classes this teacher teaches (via `classes.teacher_id` or `class_subject_teachers`) | ☐ |

## C. Forms & validation

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| C.1 | admin | Add Student with DOB in the future | Inline red error under DOB; toast on submit; record NOT created | ☐ |
| C.2 | admin | Add Student with DOB > 22 years ago | Same — validation kicks in | ☐ |
| C.3 | admin | Add Student with empty DOB | Save succeeds (DOB is optional) | ☐ |
| C.4 | admin | Click "Add Student" button | Form opens (no dead button) | ☐ |
| C.5 | admin | Click "Post Announcement" / submit | Insert succeeds, toast confirms, feed refreshes | ☐ |
| C.6 | admin | Quick Enroll Wizard, step 0, future DOB | "Next" disabled until DOB valid | ☐ |

## D. Search

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| D.1 | parent | Open Students or any nav | No "Search" page reachable; "No results found" never appears unprompted | ☐ |
| D.2 | admin / teacher | Students page → top search box | Filtering by name / guardian / phone / class works | ☐ |
| D.3 | super_admin | `/app/search` | Tabs: Schools / Admins / Teachers / Parents / Students. Type ≥ 2 chars to search | ☐ |

## E. Auth flows

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| E.1 | new user | Receive magic link → click → land on app | Profile auto-provisioned with role=parent, school_id=null. Lands on parent dashboard. | ☐ |
| E.2 | admin | Invite teacher (Teachers page) | Email sent. `pending_invitations` row created | ☐ |
| E.3 | invited teacher | Click magic link | Lands on teacher dashboard. `public.users.role_key='teacher'`, `teachers` row exists, `pending_invitations.consumed_at` set | ☐ |

## F. Grades & assessments

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| F.1 | teacher | Grades page → "+ New assessment / assignment" | Form appears, can create with name+weight+term | ☐ |
| F.2 | teacher | Created assessment appears in dropdown for that term | Visible immediately, can be selected | ☐ |
| F.3 | teacher | Enter scores for students, Save | Grades persist; reload shows them | ☐ |

## G. Helpdesk

| # | Role | Action | Expected | OK? |
|---|---|---|---|---|
| G.1 | admin / teacher / parent | Sidebar → Helpdesk | Yellow privacy notice banner shown | ☐ |
| G.2 | parent | New ticket without ticking the privacy checkbox | Submit blocked with toast | ☐ |
| G.3 | parent | New ticket: pick category, subject, body, submit | Ticket created, appears in left list as "open" | ☐ |
| G.4 | parent | Reply to own ticket with attachment | Reply + image render in thread | ☐ |
| G.5 | super_admin | `/app/helpdesk` | All tickets across schools visible. Status dropdown changes status | ☐ |
| G.6 | super_admin | Reply on a ticket | Reply marked "Abogida support". Creator sees it on refresh | ☐ |
| G.7 | other school_admin | Helpdesk | Only sees their own tickets. CANNOT see other admins'/teachers'/parents' tickets in same school | ☐ |

## H. Misc

| # | Check | Expected | OK? |
|---|---|---|---|
| H.1 | Password storage | Supabase Auth handles via bcrypt. `auth.users.encrypted_password` is hashed (no plaintext anywhere) | ☐ |
| H.2 | RLS on `helpdesk_tickets` | Other parents/teachers/admins in the same school cannot SELECT a ticket they didn't create | ☐ |
| H.3 | RLS on `daily_updates` | Parent in school A cannot read updates from class their child is not enrolled in | ☐ |

## Sign-off

- Tester: _______________________
- Date: _______________________
- All issues filed via Helpdesk: ☐
