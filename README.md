# Signet Workforce ERP - Backend

Node.js / Express / TypeScript REST API for the Signet Workforce ERP system.

## Architecture

Feature-based clean architecture under `backend/src/`:

| Layer | Responsibility |
|-------|----------------|
| **modules/** | Feature routes, controllers, services, repositories |
| **middleware/** | Auth, error handling, request tracing |
| **database/** | PostgreSQL pool, migrations, seeding |
| **config/** | Environment configuration, Swagger |
| **common/** | Shared errors and response helpers |
| **utils/** | JWT, password hashing, formatters, logging |

## Tech Stack

- Node.js 22 LTS
- Express.js + TypeScript (strict mode)
- PostgreSQL with raw SQL via `pg`
- JWT authentication + bcrypt
- Winston logging, Helmet, CORS, rate limiting
- Swagger API documentation
- Docker-ready deployment

## Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [PostgreSQL 16](https://www.postgresql.org/) (or Docker)
- Docker (optional)

## Quick Start (Local)

### 1. Start PostgreSQL

```bash
docker compose up postgres -d
```

### 2. Configure environment

```bash
cp .env.example .env
```

### 3. Install and run

```bash
cd backend
npm install
npm run db:init   # migrations + seed (also runs on startup)
npm run dev
```

The API starts at **http://localhost:5000**.

- Swagger UI: http://localhost:5000/swagger
- Health check: http://localhost:5000/health

### Default admin credentials

| Field | Value |
|-------|-------|
| Email | `sunil.kumar@signetcorporateservices.com` |
| Password | `AdminSignet@123` |

To reset the default admin on an existing database:

```bash
cd backend && npm run seed:auth
```

## VS Code / Cursor

- **F5** — Launch API with debugger (opens Swagger)
- **Tasks** — `build`, `dev`, `db-init`

## API Modules

All routes are prefixed with `/api`:

| Module | Endpoints |
|--------|-----------|
| **Auth** | `POST /auth/login`, `/refresh-token`, `/logout`, `/change-password`, `/forgot-password`, `/reset-password`, `GET /auth/profile` |
| **Users** | `GET/POST /users`, `GET/PUT /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/reset-password`, `GET /users/:id/login-history` |
| **Login History** | `GET /login-history`, `GET /login-history/summary`, `GET /auth/login-history` (self) |
| **Roles** | `GET/POST /roles`, `GET/PUT /roles/:id`, `PUT /roles/:id/permissions`, `GET /permissions` |
| **Employees** | CRUD with pagination and filters |
| **Departments / Designations** | List organization data |
| **Clients / Sites** | Client and site management |
| **Attendance** | List and mark attendance |
| **Leave** | List, request, approve/reject |
| **Payroll** | List runs, process payroll |
| **Billing** | Invoice list and create |
| **Dashboard** | Summary statistics |
| **Documents** | File upload (`POST /documents/upload`) |
| **Employees** | Profile photo via `POST /employees/:id/photo` |
| **Shifts** | List and manage work shifts |
| **Holidays** | List and manage company holidays |
| **Notifications** | In-app notifications for users |
| **Reports** | Attendance, payroll, and billing reports |

## Docker

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| API | http://localhost:5000 |
| Swagger (dev) | http://localhost:5000/swagger |
| Health | http://localhost:5000/health |
| PostgreSQL | localhost:5432 |

## Project Structure

```
signet-workforce-erp-backend/
├── backend/
│   ├── src/
│   │   ├── modules/       # Feature modules
│   │   ├── middleware/
│   │   ├── database/
│   │   ├── config/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── Dockerfile
│   └── package.json
├── scripts/migrations/      # SQL migrations
├── uploads/                 # File storage
├── docker-compose.yml
└── .env.example
```

## Frontend Compatibility

This API matches the Angular frontend contract (`/api/*` routes, camelCase JSON, paginated responses, JWT Bearer auth). The frontend proxy targets `http://localhost:5000`.

## CI

GitHub Actions type-checks, builds, and runs a smoke test against PostgreSQL on every push/PR to `main` and `develop`.

## Deployment

Cloud-agnostic — works on Railway, Render, AWS App Runner/ECS, Azure App Service, and Docker. Set environment variables from `.env.example`; never commit secrets.
