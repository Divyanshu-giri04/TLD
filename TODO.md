# MongoDB Migration + Login/JS Fix — Task Plan

## Goal
- Use MongoDB as the database (with SQLite fallback so the app always boots).
- Fix all JS-related issues.
- Ensure login pages (admin/client/crew) work.
- Provide a Postman collection to verify API keys and all endpoints.

## Approach (auto-detect)
- App uses MongoDB when `MONGODB_URI` is set AND reachable; otherwise falls back to the existing SQLite/SQL backend so login keeps working.
- All controllers route through the unified `get/run/query` layer in `src/config/db.js`, so they work unchanged on both Mongo and SQL.

## Mongo path (implemented)
- `mongoose` installed (`^9.9.1`).
- `src/config/models.js` — Mongoose models for all collections (users, api_keys, crew_members, departments, projects, messages, project_assignments, teams, team_members, servers, site_settings, password_reset_tokens). Numeric `id` via `id_counters`.
- `src/config/db.js` — routes SQL→Mongo via `mongoQuery` when Mongo reachable; seeds on first connect; falls back to SQL.
- `src/config/mongoQuery.js` — SQL→Mongo translator (SELECT/INSERT/UPDATE/DELETE + JOINs used by controllers).
- `src/config/repo.js` — auto-increment id helper (fixed deprecated `new` option → `returnDocument`).
- `src/config/seed.js` — seeds admin/departments/crew/settings into Mongo on first connect.
- `src/middleware/auth.js` — API-key verification now routed through the Mongo-aware db layer.
- Fixed `crew_members` email/login_id unique index bug that broke seeding (removed `unique:true` on empty-string fields).

## Verification (MONGODB_URI reachable via mongodb-memory-server)
- [x] Server boots on MongoDB (Driver: MONGO).
- [x] Default data seeded (admin, departments, crew, settings).
- [x] Admin login works (200).
- [x] Client register works (201) and generates an API key.
- [x] Client login works (200).
- [x] API-key verification via `x-api-key` header on `/api/auth/me` works (200).
- [x] Data confirmed in MongoDB (users=2, api_keys=1).
- [x] Persistent MongoDB started via `run-mongo.js` on 27017 (`DATA_DIR=.mongodb-data`).
- [x] Full HTTP smoke test passes (8/8): admin login, client register/login, API-key verify, client projects, admin dashboard, crew login, invalid key rejected.
- [x] Postman-flow test passes (5/5): register → api_key → verify key → use key on `/api/projects` → login.
- [x] Admin dashboard 500 fixed: `recent_messages` CASE/subquery replaced with JS sender-name resolution on Mongo; monthly chart buckets computed in JS on Mongo.
- [x] API key now usable on `/api/projects` and `/api/projects/:id` (switched read routes to `verifyTokenOrApiKey`).
- [x] Login pages load (200): `/admin`, `/portal`, `/crew`, `/`.
- [x] Postman collection created: `TLD-Postman-Collection.json` (login, register, API-key verify, dashboards).

## How to run
1. Start MongoDB (if not already running): `node run-mongo.js` (persistent; data in `.mongodb-data`).
2. Start the app: `npm start` (or `node src/server.js`) → logs "Driver: MONGO".
3. Open the login pages or import `TLD-Postman-Collection.json` into Postman and set `base_url` = `http://localhost:3998`.
4. Run `node smoke-test-http.js` / `node verify-postman-flow.js` for a full health check.

## Remaining / cleanup
- The runtime log files (`server-out.log`, `server-err.log`, `mongo-out.log`, `mongo-err.log`) are held open by the running processes; they can be deleted once the servers are stopped.
