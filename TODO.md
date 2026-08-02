# TODO — Audit Fix Completion

Tracked against `AUDIT.md`. Most critical and functional fixes are already in place;
these are the remaining items.

## Remaining Fixes

- [x] **1. Move root assets into `public/`** (audit 1.1)
  - `css2.css` and `launch-desk-portfolio.html` were already present in `public/` (confirmed identical hashes)
  - Removed the duplicate root copies so only `public/` is served statically

- [x] **2. Fix `index.html` misleading "Check your email" message** (audit 2.3)
  - Users now create their own password, so the email claim was removed
  - Updated to: *"Application submitted! You can now log in to the Client Portal with the password you set."*

- [x] **3. Fix `/api/public/departments` URL** in `index.html`
  - Route is mounted at `/api` so changed to `/api/departments`

## Round 2 — New audit fixes

- [x] **4. Postgres-compatible SQL** (audit §3 migration path)
  - `database.js`: add + export `nowExpression()` (`CURRENT_TIMESTAMP` on pg, `datetime('now','localtime')` on sqlite)
  - `routes/projects.js`: use it for `updated_at` (update + upload handlers)
  - `routes/auth.js`: use it for the reset-token expiry comparison

- [x] **5. Stop leaking sensitive crew fields publicly** (audit 1.x hardening)
  - `middleware/auth.js`: add `optionalAuth` (never 401s; sets `req.user` when a valid Bearer token is present)
  - `routes/crew.js`: `GET /api/crew` uses `optionalAuth`; public callers get a safe subset (no email/login_id/salary/contact_no); admins still get full fields

- [ ] **6. Replace `prompt()` password resets in admin panel** (audit 2.7)
  - `public/admin-panel.html`: proper password-reset modal (target type/id + new password) replacing both `prompt()` calls

- [ ] **7. Client portal shows real assigned crew** (audit 2.6)
  - `public/client-portal.html`: render `assigned_crew_details` names instead of the stale `assigned_crew` blob

- [ ] **8. Fix zod v4 enum error signature** in `routes/admin.js`
  - `z.enum(['client','crew','admin'], { error: '...' })`

- [ ] **9. Repo docs** (audit §3)
  - `README.md` — setup, env vars, scripts, architecture
  - `.env.example` — documented env template

## Verification

- [ ] Run `node scan-audit.js` — no `prompt(` matches remaining
- [ ] Restart server, run `node test-api.js` — all pass
- [ ] Run `node verify-static.js` — static exposure checks pass
- [ ] Confirm `GET /api/crew` (public) no longer returns `salary`/`email`/`login_id`/`contact_no`
- [ ] Confirm `GET /api/crew` with admin Bearer token still returns full fields

