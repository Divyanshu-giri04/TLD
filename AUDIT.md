# The Launch Desk — Code Audit & Roadmap

Reviewed: `TLD/` (Express + sql.js + vanilla JS, 3 HTML pages, 6 route modules).
Everything marked **verified** below was reproduced by running the server locally.

---

## 1. Critical — fix before this goes anywhere public

### 1.1 Your entire source tree is downloadable — including the database
`server.js` line 26:

```js
app.use(express.static(__dirname));   // serves the PROJECT ROOT
```

**Verified:** `GET /tld.db` → `200`, 57 KB — the complete SQLite file: every user row, every bcrypt hash, every client's email/phone/company, every project and message. `GET /routes/auth.js` → `200`. `GET /package-lock.json` → `200`.

`.env` happens to be blocked (Express ignores dotfiles by default), but that is luck, not design.

**Fix:** delete that line. Move `css2.css` and `launch-desk-portfolio.html` into `public/`. Only `public/` should ever be static.

### 1.2 Secrets are committed to git
`.env` is tracked (`git ls-files` confirms it), containing:

```
JWT_SECRET=tld-company-secret-key-2026
ADMIN_PASSWORD=Admin@2026
```

There is no `.gitignore` at all — `node_modules` is also committed (**1,185 tracked files**).

Worse, `middleware/auth.js` hardcodes the same secret as a fallback:

```js
const JWT_SECRET = process.env.JWT_SECRET || 'tld-company-secret-key-2026';
```

Anyone with repo access can forge an admin JWT. **Fix:** add `.gitignore`, `git rm -r --cached node_modules .env`, rotate the secret and admin password, and make the app crash on boot if `JWT_SECRET` is missing rather than falling back.

### 1.3 Stored XSS in the admin panel
`client-portal.html` escapes output (`escapeHtml`). `admin-panel.html` does not — it interpolates DB values straight into `innerHTML`:

```js
<td><strong>${p.title}</strong></td>
```

A client submitting a project titled `<img src=x onerror=...>` gets script execution in the admin's session, where the admin JWT sits in `localStorage` and is readable by that script. Client → admin account takeover.

**Fix:** reuse `escapeHtml` in the admin panel, or switch to `textContent` / `createElement`.

### 1.4 No rate limiting, no security headers, wide-open CORS
`app.use(cors())` allows every origin. `/api/auth/login` and `/api/crew/login` can be brute-forced without limit. No `helmet`, no CSRF protection, no request-body validation anywhere — routes read `req.body` fields directly.

**Fix:** `helmet`, `express-rate-limit` on auth routes, a CORS origin allowlist, and `zod` schemas on every POST/PUT.

---

## 2. Broken features (not just risky — actually non-functional)

### 2.1 Messaging does not work at all
`server.js` mounts the router at `/api/messages`, and the router defines `/:projectId/messages`. So the real URL is `/api/messages/:id/messages`. Both frontends call `/api/projects/:id/messages`.

**Verified:** `GET /api/projects/1/messages` → `404`.

Every chat feature in the portal and the admin panel is dead. **Fix:** mount at `/api/projects`, or change the paths — either works, they just have to agree.

### 2.2 API keys are attached to the wrong user (and are never checked)
`routes/auth.js`, registration:

```js
const result = prepare('INSERT INTO users ...').run(...);
prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)')
  .run(result.changes, apiKey, 'Default');   // ← rows-modified, not the new user's id
```

`result.changes` is a row count, not an ID. **Verified:** registering a user created an `api_keys` row with `user_id = 0` — pointing at a user that doesn't exist. (Foreign keys are declared but sql.js isn't enforcing the pragma, so it silently succeeds.)

Separately, `verifyApiKey` in `middleware/auth.js` is exported and **never used by a single route**. The portal proudly displays an API key that authenticates nothing.

**Fix:** get the real ID via `SELECT last_insert_rowid()`. Then either wire `verifyApiKey` into the routes or remove the feature from the UI.

### 2.3 Clients created by the apply form can never log in
`index.html` registers the applicant with `password: 'temp-pass-' + Date.now()`, then shows *"Check your email for login details."* There is no email sending anywhere in the codebase. That password is generated, hashed, and discarded. There is also no password-reset route — the account is permanently unreachable.

### 2.4 "Get last inserted row" is a race condition, everywhere
This pattern appears in `auth.js`, `clients.js`, `projects.js`, `crew.js`, `messages.js`:

```js
prepare('SELECT * FROM projects ORDER BY id DESC LIMIT 1').get();
```

Two concurrent requests and user A gets handed user B's record — including, in `clients.js`, a freshly created client's ID being used to attach an API key.

### 2.5 Admin site settings never reach the homepage
`index.html → loadSettings()` calls `/api/admin/settings` with no auth header. That endpoint is `verifyToken, requireAdmin` — so it returns 401 on every page load and silently falls back to hardcoded values. Editing settings in the admin panel changes nothing visible.

`loadDepartments()` is worse: it fetches the settings endpoint, ignores the response entirely, and renders a hardcoded array. The `departments` table is seeded and never read.

**Fix:** add a public `GET /api/public/settings` (whitelisted keys only) and a public `GET /api/departments`.

### 2.6 Assigned crew is stored as an unqueryable JSON blob
`projects.assigned_crew TEXT`. `routes/crew.js` has to `SELECT *` every project, `JSON.parse` each one in JS, and filter with a try/catch that falls back to substring matching on names. This breaks the moment two people share a name, and it cannot be indexed, joined, or counted.

**Fix:** a `project_assignments (project_id, crew_id, role)` join table.

### 2.7 Other functional issues

| Issue | Where |
|---|---|
| Admin login uses `prompt()` — password typed in cleartext, no autofill, no password manager | `admin-panel.html:310` |
| Crew login accepts **plaintext** password comparison as a fallback | `routes/crew.js` |
| `title \|\| existing.title` on update — a field can never be cleared to empty | `routes/projects.js` |
| Upload filter is `extname \|\| mimetype` (OR) — a renamed `.jpg` passes | `middleware/upload.js` |
| `/uploads` is public static — no access control on any client's files | `server.js:29` |
| Admin "Messages" tab does an N+1 fetch: one HTTP request per project | `admin-panel.html:565` |
| No pagination anywhere — `/api/projects` returns the entire table | all routes |
| Error handler leaks `err.message` to the client | `server.js:70` |
| Crew login + crew projects APIs exist, but **there is no crew UI page** | `public/` |

---

## 3. Architecture

**sql.js is the wrong engine here.** It holds the whole database in memory and rewrites the entire file to disk on *every single write* (`saveDatabase()` inside `run()`). That means: no concurrency safety, no real transactions, growing write cost, and — critically — **on Render/Railway/Fly the filesystem is ephemeral, so the DB is wiped on every redeploy.**

Migrate to Postgres (Neon or Supabase, both have free tiers), or at minimum `better-sqlite3` on a mounted persistent volume.

**Also missing:** no README, no tests, no linter, no CI, no Dockerfile, no error tracking, no logging, no DB backups, no migration system (schema changes currently require hand-editing `initTables`).

**Repo hygiene:** an unrelated `beauty_website/` project sits in the same folder, plus a stale `launch-desk-portfolio.html` (535 lines) duplicating the homepage.

**SEO/a11y:** no meta description, no Open Graph tags, no favicon, no `robots.txt`, no sitemap, no JSON-LD. For a company that sells websites, this is the part clients will notice.

---

## 4. Features worth adding

### Public site (biggest gap)
You claim **40+ projects shipped** and show **zero of them**. For an agency site that's the single most important missing page.

- **Case studies** — problem, what you built, outcome, screenshots. Even 3 real ones.
- **Testimonials** from the 18 repeat clients you cite.
- **Careers / "join the crew"** form — you have an HR department and no way to apply to it.
- **Blog** — the only realistic organic-traffic channel for a small agency.
- **Booking** — Cal.com embed for a discovery call, instead of a form that vanishes into a DB.
- **Live availability** driven by real project counts rather than a hardcoded "BOOKING Q4".

### Client portal
- **Working real-time chat** (fix §2.1 first, then Socket.io or SSE) with file attachments — the `messages.attachment` column already exists and is never populated.
- **Email notifications** (Resend or Nodemailer): welcome + set-password link, status changes, new messages.
- **Password reset flow** — currently impossible.
- **Milestones and a progress bar** instead of one status enum. A `tasks` table under each project.
- **Quotes → invoices → payments** (Razorpay for India, Stripe otherwise), with PDF receipts.
- **Approval step on deliverables** — the `review` status exists but the client has no way to approve or request changes.
- **File previews and versioning** in the portal.

### Crew dashboard (the API is half-built already)
- Assigned projects, deadlines, personal workload view.
- Time tracking per project — feeds directly into invoicing.
- Internal notes visible to crew/admin but not the client.
- Capacity board driven by the `ON DECK` status you already display.

### Admin panel
- Real charts (Chart.js) — the current bars are hand-rolled divs.
- Search, filter, sort, pagination on every table.
- Audit log of admin actions.
- CSV export for clients and projects.
- Editable departments that actually drive the homepage.

### Platform
- Postgres, `.gitignore` + rotated secrets, `helmet` + rate limiting + `zod`.
- httpOnly refresh-token cookies instead of `localStorage` (kills the §1.3 escalation path).
- Sentry for errors, Plausible for analytics.
- Vitest + Supertest on the auth and permission logic, run in a GitHub Action.
- Dockerfile + automated DB backups. (`/health` already exists — good.)

---

## 5. Suggested order

**This week (security + broken basics)**

1. Remove `express.static(__dirname)`
2. `.gitignore`, untrack `.env` and `node_modules`, rotate the secret and admin password
3. Fix the messages route mount
4. Escape output in `admin-panel.html`
5. Fix `last_insert_rowid()` in registration and client creation

**Next (make it trustworthy)**

6. Add `helmet`, `express-rate-limit`, `zod` validation
7. Migrate to Postgres
8. Email sending + password reset
9. Public settings/departments endpoints so the admin panel means something
10. Replace `prompt()` admin login with a real form

**Then (make it sell)**

11. Case studies page
12. Crew dashboard
13. Milestones + invoicing
14. Tests and CI
