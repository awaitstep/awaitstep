---
title: Local Setup
---

# Local Setup

This guide walks through setting up the AwaitStep monorepo for local development.

## Prerequisites

- **Node.js** 20 or later
- **pnpm** 9 or later (`npm install -g pnpm`)
- **Docker** (optional — for running PostgreSQL locally)

## 1. Clone

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
```

## 2. Install dependencies

```bash
pnpm install
```

This installs dependencies for all packages and apps in the monorepo.

## 3. Configure environment

Copy the example env file and fill in the required values:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
# Generate both secrets
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=http://localhost:3001

# Auth — configure at least one method
RESEND_API_KEY=re_...          # magic link email
# GITHUB_CLIENT_ID=            # GitHub OAuth
# GITHUB_CLIENT_SECRET=

# Server
PORT=3001
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# Frontend
VITE_API_URL=http://localhost:3001
VITE_APP_URL=http://localhost:3000
```

:::info
At least one auth method (`RESEND_API_KEY`, GitHub OAuth, or Google OAuth) must be configured. Without one, the sign-in page will have no available login options.
:::

## 4. Build packages

```bash
pnpm build
```

This builds all packages in dependency order. You must run this at least once before starting the dev server.

## 5. Start the dev server

```bash
pnpm dev
```

This starts all apps in watch mode:

- **API** at `http://localhost:3001`
- **Web app** at `http://localhost:3000`
- **Docs** at `http://localhost:5173` (if the docs app is configured)

## 6. Run tests

```bash
pnpm test
```

Runs the test suite across all packages. To run tests for a single package:

```bash
cd packages/ir
pnpm test
```

## 7. Lint

```bash
pnpm lint
```

Fix lint errors before committing. The CI pipeline will fail on lint errors.

## 8. Type check

```bash
pnpm typecheck
```

Always run this before opening a pull request.

## Database

By default AwaitStep uses SQLite. The database file is created automatically at the location specified by `DATABASE_URL` (defaults to `./data/db.sqlite` in the API app directory).

To use PostgreSQL locally:

```bash
# Start PostgreSQL with Docker
docker run -d \
  --name awaitstep-db \
  -e POSTGRES_USER=awaitstep \
  -e POSTGRES_PASSWORD=awaitstep \
  -e POSTGRES_DB=awaitstep \
  -p 5432:5432 \
  postgres:16

# Add to .env
DATABASE_URL=postgres://awaitstep:awaitstep@localhost:5432/awaitstep
```

Migrations run automatically on startup.
