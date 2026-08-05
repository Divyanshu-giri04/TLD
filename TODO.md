# TODO — Restructure The Launch Desk into Layered admin/client/crew folders

Goal: Convert the current routes/ structure into the `node setup` layered architecture
(controllers + routes) grouped into `admin`, `client`, `crew` folders, keeping the
working `database.js` CommonJS data layer intact.

## Steps
- [x] Create `src/config/db.js` (wraps existing database.js)
- [x] Create `src/middleware/auth.js` (copied from middleware/auth.js)
- [x] Create `src/middleware/upload.js` (copied from middleware/upload.js)
- [x] Create `src/utils/schemas.js` (shared zod schemas)
- [x] Create `src/admin/controllers/admin.controller.js` (dashboard, stats, settings, messages, reset-password, servers, teams)
- [x] Create `src/admin/routes/admin.routes.js`
- [x] Create `src/client/controllers/auth.controller.js` (register, login, me, keys, forgot/reset password)
- [x] Create `src/client/controllers/client.controller.js` (client CRUD)
- [x] Create `src/client/controllers/project.controller.js` (project CRUD + upload)
- [x] Create `src/client/controllers/messages.controller.js` (messages + unread)
- [x] Create `src/client/routes/client.routes.js`
- [x] Create `src/crew/controllers/crew.controller.js` (crew CRUD, login, projects, forgot-password)
- [x] Create `src/crew/routes/crew.routes.js`
- [x] Create `src/shared/controllers/files.controller.js` (file serving)
- [x] Create `src/shared/controllers/public.controller.js` (public settings, departments)
- [x] Create `src/shared/routes/shared.routes.js`
- [x] Create `src/router/index.js` (route aggregator)
- [x] Create `src/server.js` (entry, rewired from server.js)
- [x] Update root package.json start script to point to src/server.js
- [x] Verify server boots and routes work

## Verification results
- ✅ Server boots successfully (PORT 3456)
- ✅ `/api/health` returns `{"status":"ok","service":"the-launch-desk"}`
- ✅ `/api/public/settings` returns whitelisted settings
- ✅ `/api/departments` returns departments list
- ✅ `/api/crew` returns public crew subset
- ✅ `/api/crew/login` works (DEV-01 / dev-01@2026)
- ✅ `/api/auth/login` works (admin@thelaunchdesk.io / Admin@2026)
- ✅ `/api/admin/stats` returns admin dashboard stats (with admin token)
- ✅ `/api/projects` returns project list (with admin token)
