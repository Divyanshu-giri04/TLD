# TODO — Connect All Orphaned src Files to the Main Code (Option A)

Goal: Ensure every src file is `require`d/connected to the running app so no file is dead or unused.

## Steps

- [x] 1. Create `src/admin/routes/admin.monolith.routes.js` that mounts the monolithic
      `admin.controller.js` (AdminController) so it is wired into the app.
- [x] 2. Export the new monolith router from `src/admin/index.js`.
- [x] 3. Mount the monolith router in `src/router/index.js` (new `/api/admin/legacy` namespace to
      avoid route conflicts with the existing split admin routes).
- [x] 4. Wire the previously-unused per-module `middleware/guard.js` wrappers into their module
      index files (`src/admin/index.js`, `src/client/index.js`, `src/crew/index.js`) so they are
      loaded/connected as part of the module graph.
- [x] 5. Verify the server boots and all routes register without conflicts (optional smoke test).
