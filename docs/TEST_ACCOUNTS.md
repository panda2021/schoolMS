# Test accounts — ABOGIDA / FIDEL

Hand this to testers so they know which login to use and what to try. Every
tester logs in at the same place, then lands on their own dashboard by role.

> **Fill in the blanks below before sending.** The app ships with no seeded
> passwords — you set each one yourself (super-admin creates the school admin
> and sets/resets passwords; parents get a magic link by email). Replace every
> `<...>` with the real value, then delete this note.

**App URL:** `https://<your-app>.vercel.app`
**Login page:** `https://<your-app>.vercel.app/login`

---

## Accounts by role

| Role | Email | Password | Lands on | What they can test |
|------|-------|----------|----------|--------------------|
| **Super admin** (platform owner) | `<super-admin-email>` | `<password>` | `/app/super` | Create/edit schools, branding, Feature Matrix (`/app/features`), reset any password |
| **School admin** | `<admin-email>` | `<password>` | `/app/admin` | Teachers, Parents, Attendance, Settings/Subjects, reset teacher & parent passwords, per-user permissions |
| **Teacher** | `<teacher-email>` | `<password>` | `/app/teacher` | Take attendance, classes, grades, report cards, announcements |
| **Parent** | `<parent-email>` | *(magic link — no password)* | `/app/parent` | View their child, child attendance history, messages/announcements |

> The **parent** account normally signs in through the invite/magic-link email,
> not a password. If you want a parent to log in with a password instead, reset
> it from the school admin's `/app/parents` page and put it in the table above.

---

## How testers log in

1. Go to the **Login page** above.
2. Enter the email + password from your row in the table.
3. You are taken to your dashboard automatically — no need to pick a role.
4. **Dark mode:** toggle in the top bar (optional).
5. **Forgot password?** Click "Forgot password" on the login page → check email →
   set a new one. (Parents: use the magic link in your invite email instead.)

## Notes for testers

- Use a real inbox you control if you were sent an **invite link** (teachers and
  parents) — the link is single-use and role-specific.
- A brand-new person who signs in **without** an invite lands on a
  "Pending approval" screen; a school admin approves them from the Pending tab.
- Report anything that shows a **blocking error dialog** (it stays until you
  dismiss it) — copy the message when you report.

---

*Full step-by-step QA script for maintainers: see `docs/TESTING.md`.*
