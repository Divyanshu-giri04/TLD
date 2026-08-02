# The Launch Desk (TLD)

A full-stack agency management platform with a public marketing site, client portal, crew portal, and admin panel — plus a REST API for project intake, messaging, crew/team management, and site settings.

## Features

- **Public site** — landing page, departments, contact/project application intake
- **Client Portal** (`/portal`) — register/login, submit projects, track status, send/receive messages, manage API keys
- **Crew Portal** (`/crew`) — crew member login, assigned projects, messaging
- **Admin Panel** (`/admin`) — dashboard with charts, project status management, clients, crew, servers, teams, site settings, password resets
- **REST API** — JWT auth + API-key auth, Zod-validated request bodies, file uploads
- **Security** — Helmet, CORS allowlist, rate limiting, bcrypt password hashing, parameterized SQL, no insecure fallbacks

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express
- **Validation:** Zod
- **Database:** SQLite (via `sql.js`, file `tld.db`) or PostgreSQL (via `DATABASE_URL`)
- **Auth:** JWT (`jsonwebtoken`) + bcrypt, API keys for programmatic access

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set JWT_SECRET to a long random string, and choose admin credentials

# 3. Start the server
npm start
# or for development with auto-reload:
npm run dev
```

The server prints its URLs on boot:

```
🚀 The Launch Desk server running
📡 http://localhost:3000
📊 Admin Panel: http://localhost:3000/admin
🔑 Client Portal: http://localhost:3000/portal
👥 Crew Portal: http://localhost:3000/crew
🌐 Website: http://localhost:3000
```

## Environment Variables

| Variable        | Required | Default                              | Description                                        |
| --------------- | -------- | ------------------------------------ | -------------------------------------------------- |
| `JWT_SECRET`    | **Yes**  | — (server refuses to boot without it) | Secret used to sign JWTs. Use a long random string. |
| `ADMIN_EMAIL`   | Yes*     | `admin@thelaunchdesk.io`              | Email of the seeded admin account.                  |
| `ADMIN_PASSWORD`| Yes*     | `Admin@2026`                          | Password of the seeded admin account.               |
| `HOST`          | No       | `0.0.0.0`                             | Bind address.                                       |
| `PORT`          | No       | `3000`                                | HTTP port.                                          |
| `DATABASE_URL`  | No       | *(empty → SQLite file `tld.db`)*      | Postgres connection string, e.g. `postgres://...`. |
| `CORS_ORIGINS`  | No       | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed origins.       |

\* Used to seed the first admin on a fresh database.

## Scripts

| Command                | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `npm start`            | Start the server (uses `node server.js`).               |
| `npm run dev`          | Start with auto-reload (uses `nodemon` if installed).   |
| `node test-api.js`     | Smoke-test the API end-to-end (requires a running server). |
| `node verify-static.js`| Verify static-file exposure rules (requires a running server). |
| `node scan-audit.js`   | Scan source files for leftover audit-pattern matches.   |

## Project Structure

```
.
├── server.js               # Express app, security middleware, static + API mounting
├── database.js             # DB driver (sql.js / Postgres), schema init, helpers
├── middleware/
│   ├── auth.js             # JWT verify, API-key verify, optionalAuth, requireAdmin
│   └── upload.js           # Multer upload config (size + type limits)
├── routes/
│   ├── auth.js             # Register/login, forgot/reset password, API keys
│   ├── clients.js          # Admin: manage client accounts
│   ├── projects.js         # List/create/update/delete projects, crew assignments
│   ├── messages.js         # Per-project messaging + unread counts
│   ├── crew.js             # Crew list/login/CRUD, password reset
│   ├── admin.js            # Dashboard, settings, servers, teams, reset-password
│   ├── public.js           # Public settings, departments
│   └── files.js            # Authenticated file downloads
├── public/                 # Statically served (only this directory)
│   ├── index.html          # Marketing site
│   ├── client-portal.html  # Client portal
│   ├── crew-portal.html    # Crew portal
│   ├── admin-panel.html    # Admin panel
│   └── css/style.css       # Shared styles
├── uploads/                # Uploaded project files (not publicly served)
├── .env.example            # Documented environment template
└── TODO.md                 # Audit fix tracker
```

## API Overview

| Endpoint                              | Method | Auth               | Description                              |
| ------------------------------------- | ------ | ------------------ | ---------------------------------------- |
| `/api/public/settings`                | GET    | Public             | Public site settings.                    |
| `/api/departments`                    | GET    | Public             | Department list.                         |
| `/api/auth/register`                  | POST   | Public (limited)   | Create client account.                   |
| `/api/auth/login`                     | POST   | Public (limited)   | Login (client/admin/crew via login_id).  |
| `/api/auth/forgot-password`           | POST   | Public (limited)   | Request a reset token.                   |
| `/api/auth/reset-password`            | POST   | Public (limited)   | Redeem a reset token.                    |
| `/api/projects`                       | GET/POST | Bearer/API key  | List / create projects.                  |
| `/api/projects/:id`                   | GET/PUT/DELETE | Bearer/API key | Project detail / admin update / delete. |
| `/api/projects/:id/messages`          | GET/POST | Bearer/API key  | Thread messages for a project.           |
| `/api/projects/:id/upload`            | POST   | Bearer/API key     | Upload files (max 5, 20MB each).         |
| `/api/crew`                           | GET/POST | optional/admin | List crew (safe subset public) / add.    |
| `/api/admin/dashboard`                | GET    | Admin Bearer       | Dashboard stats.                         |
| `/api/admin/settings`                 | GET/PUT | Admin Bearer      | Site settings.                           |
| `/api/admin/messages`                 | GET    | Admin Bearer       | All messages (single query).             |
| `/api/admin/servers`                  | GET/POST | Admin Bearer      | Servers CRUD.                            |
| `/api/admin/teams`                    | GET/POST | Admin Bearer      | Teams CRUD.                              |

## Security Notes

- `JWT_SECRET` is mandatory — the app fails fast rather than falling back to a default.
- Only `public/` is served statically; project root files (`.env`, `tld.db`, `routes/`, etc.) are not exposed.
- Uploaded files are stored in `uploads/` and served only through the authenticated `/api/files` endpoint.
- Auth endpoints are rate-limited; the global API is rate-limited too.
- Passwords are hashed with bcrypt (cost 10).
- Public `GET /api/crew` returns a safe field subset (no email, login_id, salary, or contact_no); admins see full data.
- `prompt()`/native dialogs are not used in the admin UI — all flows use real forms/modals.

