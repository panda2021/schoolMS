# Test accounts — ABOGIDA / FIDEL

Everyone logs in at the same page, then lands on their own dashboard by role.

**App URL:** `https://abogida-taupe.vercel.app/`
**Login page:** `https://abogida-taupe.vercel.app/login`

> ✅ These credentials are **live** — set and login-verified against the production database on 2026-07-04.

---

## Accounts

| Role | Email | Password | School | Lands on | What to test |
|------|-------|----------|--------|----------|--------------|
| **School admin** | `admin@admin.com` | `Fidel-Admin-7392` | Saint Joseph School | `/app/admin` | Teachers, Parents, Attendance, Settings/Subjects, reset teacher & parent passwords, per-user permissions |
| **Teacher** | `teacher@test.com` | `Fidel-Teach-4815` | Demo School | `/app/teacher` | Take attendance, classes, grades, report cards, announcements |
| **Parent** | `parent1@test.com` | `Fidel-Parent-2648` | Demo School (4 linked students) | `/app/parent` | View children, child attendance history, messages/announcements |

*(Super-admin is the platform owner's own login — not shared with testers.)*

**Note:** the admin account belongs to a different school than the teacher/parent accounts, so admin actions won't affect what the teacher/parent sees. Test each role's flows independently.

---

## How to log in

1. Open the **Login page** above.
2. Enter your email + password from the table.
3. You land on your dashboard automatically — no role picker.
4. **Dark mode:** toggle in the top bar (optional).
5. **Forgot password?** These are test emails without real inboxes — if you lock yourself out, ask the owner to reset the password instead.

## Notes for testers

- If anything shows a **blocking error dialog** (stays until you dismiss it), copy the message and report it.
- A brand-new person who signs in **without** an invite lands on a "Pending approval" screen — that's expected; an admin approves them.

---

*Full QA script for maintainers: `docs/TESTING.md`.*
