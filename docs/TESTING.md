# TESTING — end-to-end manual pass (2026-07-02 build)

Covers everything shipped 2026-07-02: password resets (0029), parent model +
pending approval (0030), UI overhaul, Phase 4 subject editing, blocking error
dialogs, Phase 5 capability gating + per-user overrides (0031).

**Automated checks already green** (no action needed):
- `tsc --noEmit` + `npm run build` clean.
- `scripts/smoke_phase5.mjs` — 12/12 against the live DB on 2026-07-02:
  migrations 0027-0030 structurally verified, including that the 0029 version
  of `admin_reset_password` is the one deployed. Re-run anytime:
  `cp scripts/smoke_phase5.mjs frontend/.s.mjs && cd frontend && node .s.mjs && rm .s.mjs`

**Preconditions for the manual pass**
- [ ] Migration `0031_phase5_capabilities.sql` applied in Supabase
- [ ] Latest frontend deployed
- You need: your super-admin login, one school with a school_admin you know
  the password for (reset it from the edit-school modal if not), at least one
  student in that school, and 2 spare email inboxes you control (call them
  EMAIL-A for a parent invite, EMAIL-B for a stranger).

Estimated time: ~20 minutes. Do the sections in order — later ones reuse
accounts created earlier.

---

## 1. Super admin (~4 min)

| # | Step | Expect |
|---|------|--------|
| 1.1 | Log in at /login with password | Land on /app/super; deep-teal sidebar, serif headings, warm background (new UI) |
| 1.2 | Toggle dark mode (topbar) | Chalkboard dark theme; text readable everywhere; toggle back |
| 1.3 | Open /app/features | Matrix loads. New rows exist: "Reset member passwords", "Grant extra permissions", "View own children's attendance", "View parents / Invite parents / Link-unlink parent children". Teacher column: "Create classes" and "Edit classes" UNCHECKED (0031 seed fix) |
| 1.4 | Edit a school → Branding: set a primary color + upload a logo | Save works; no error dialog |
| 1.5 | Same modal → School Admin section → type a new password → Reset Password | Success toast. Note the password — used in section 2 |
| 1.6 | Type a 3-character password → Reset Password | Button disabled (min 6) |

## 2. School admin — staff + parent management (~6 min)

Log out, log in as the school admin (password from 1.5).

| # | Step | Expect |
|---|------|--------|
| 2.1 | Check the sidebar | Teachers AND Parents items present (new), icons on every item, active page marked with the ochre tab |
| 2.2 | /app/teachers → invite a teacher with an ALREADY-INVITED email (or otherwise force an error) | **Blocking error dialog** — stays until OK/X/Esc. This is the error-popup acceptance test |
| 2.3 | On an active teacher → Reset password → set one | Success toast |
| 2.4 | On an active teacher → Permissions | Modal opens; teacher-role capabilities checked+locked with "role" badge; grant something extra (e.g. Bulk import) → "extra" badge appears |
| 2.5 | /app/parents → + Invite parent → EMAIL-A, pick relation + tick a student → Send invite | Success; row appears under Pending invitations with student count |
| 2.6 | /app/settings → Subjects → pencil on any subject | Inline editor: rename works, grade badges toggle, Save persists (reload to confirm), grades listed in KG→8 order |
| 2.7 | Subjects → trash on a DEFAULT subject (e.g. Art) | Confirm dialog mentions grades keep history; subject disappears (was impossible before) |
| 2.8 | /app/attendance | Admin view: filters, 4 summary tiles, Export CSV button works |

## 3. Parent — invited flow (~3 min)

| # | Step | Expect |
|---|------|--------|
| 3.1 | Open EMAIL-A inbox → click the magic link | Lands in the app as PARENT — not on a "pending" screen |
| 3.2 | Parent dashboard | The student ticked in 2.5 is listed as their child (auto-link worked) |
| 3.3 | Sidebar | "Attendance" item present (new child-scoped capability) → opens child attendance history |
| 3.4 | Back on the admin account: /app/parents | EMAIL-A parent listed with child chip; invitation gone from Pending |

## 4. Stranger — pending approval flow (~3 min)

| # | Step | Expect |
|---|------|--------|
| 4.1 | Log out. /login → Magic Link tab → EMAIL-B (never invited) → sign in via the email | "Account pending approval" screen; sidebar essentially empty; Sign out button works |
| 4.2 | Log in as super admin → /app/super | "Pending users" card lists EMAIL-B |
| 4.3 | Pick role=Parent + a school → Approve | Success. Card empties |
| 4.4 | Log in as EMAIL-B again | Routed to parent dashboard (no children yet — admin links them on /app/parents) |
| 4.5 | (Optional) repeat 4.1 with a third email, then Reject | Confirm dialog → account deleted; that email can no longer sign in with the old link |

## 5. Self-serve forgot password (~2 min)

| # | Step | Expect |
|---|------|--------|
| 5.1 | Log out → /login → enter EMAIL-A → "Send reset link" | Success message; email arrives |
| 5.2 | Click the link | /reset-password page; set a new password (mismatch → inline error; <6 chars → inline error) |
| 5.3 | Submit valid | "Password updated" → lands in the app. Log out; log in with EMAIL-A + the new password |

## 6. Capability matrix actually gates the UI (~2 min)

| # | Step | Expect |
|---|------|--------|
| 6.1 | As super admin: /app/features → UNCHECK school_admin "Invite teachers" | Save (optimistic) |
| 6.2 | Log in as school admin (fresh login) → /app/teachers | "+ Invite teacher" button GONE |
| 6.3 | Re-check the capability; school admin logs in again | Button back |

## 7. Teacher spot-check (~1 min)

Log in as the teacher from 2.3's reset (or invite a fresh one).

| # | Step | Expect |
|---|------|--------|
| 7.1 | Teacher dashboard loads; take attendance for a class; post a daily update | All work as before |
| 7.2 | If 2.4 granted Bulk import: sidebar shows it | NOTE: page opens, but actual imports may fail — DB RLS is still role-based. Known limitation, see "Phase 5b" in PROGRESS.md |

---

## If something fails
1. Check the browser console + the error dialog text.
2. Re-run the smoke script (top of this file) to rule out an unapplied migration.
3. `frontend/ROUTES.md` documents every login/redirect flow (Flows 1-8) —
   compare observed behavior against it.
4. Log the failure in docs/PROGRESS.md so the next session picks it up.
