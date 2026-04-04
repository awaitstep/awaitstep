---
title: Configuration
---

# Configuration

AwaitStep is configured entirely via environment variables. All variables are set in the `.env` file alongside your `docker-compose.yml`.

## Complete .env example

```bash
# ─── Security ─────────────────────────────────────────────────────────────────
TOKEN_ENCRYPTION_KEY=<64-char hex string>
BETTER_AUTH_SECRET=<base64 string>
BETTER_AUTH_URL=http://localhost:8080

# ─── Auth ─────────────────────────────────────────────────────────────────────
# Configure at least one of: magic link (Resend) or an OAuth provider.
RESEND_API_KEY=re_...

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ─── App ──────────────────────────────────────────────────────────────────────
APP_NAME=awaitstep-worker
PORT=3001
NODE_ENV=production

# ─── Database ─────────────────────────────────────────────────────────────────
# Omit for SQLite (default). Set for PostgreSQL.
# DATABASE_URL=postgres://user:password@localhost:5432/awaitstep

# ─── Frontend (dev only) ──────────────────────────────────────────────────────
VITE_API_URL=http://localhost:3001
VITE_APP_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
```

---

## Security

| Variable               | Required | Description                                                                                                                                                    |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOKEN_ENCRYPTION_KEY` | Yes      | AES-256 key used to encrypt stored secrets. Generate with `openssl rand -hex 32`. Never change this after data is stored — all secrets will become unreadable. |
| `BETTER_AUTH_SECRET`   | Yes      | Secret used by the auth library to sign session tokens. Generate with `openssl rand -hex 32`. Changing this invalidates all active sessions.                   |
| `BETTER_AUTH_URL`      | Yes      | The public URL of the AwaitStep instance. Used by the auth library to construct redirect URLs. Must match the URL users access in their browser.               |

:::danger
Never share or commit `TOKEN_ENCRYPTION_KEY` or `BETTER_AUTH_SECRET`. These are the master keys for all secrets stored in your instance.
:::

---

## Authentication

AwaitStep supports magic link (email) and OAuth. **At least one must be configured.** There is no email/password authentication.

### Magic link (Resend)

| Variable         | Required                  | Description                                                                             |
| ---------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Yes (if using magic link) | Resend API key used to send sign-in emails. Create at [resend.com](https://resend.com). |

### GitHub OAuth

| Variable               | Required              | Description                                                                                        |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `GITHUB_CLIENT_ID`     | Yes (if using GitHub) | OAuth App client ID from [github.com/settings/developers](https://github.com/settings/developers). |
| `GITHUB_CLIENT_SECRET` | Yes (if using GitHub) | OAuth App client secret.                                                                           |

Set the callback URL in your GitHub OAuth App to: `https://your-instance/api/auth/callback/github`

### Google OAuth

| Variable               | Required              | Description                                                                                         |
| ---------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Yes (if using Google) | OAuth client ID from [console.cloud.google.com](https://console.cloud.google.com/apis/credentials). |
| `GOOGLE_CLIENT_SECRET` | Yes (if using Google) | OAuth client secret.                                                                                |

Set the redirect URI in your Google Cloud project to: `https://your-instance/api/auth/callback/google`

---

## Application

| Variable   | Default            | Description                                                                                                |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `APP_NAME` | `awaitstep-worker` | Internal name used when generating Cloudflare Worker names. Should be lowercase alphanumeric with hyphens. |
| `PORT`     | `3001`             | Port the server listens on inside the container. The Docker Compose file maps this to `8080` externally.   |
| `NODE_ENV` | `development`      | Set to `production` in deployed instances. Affects logging verbosity and error detail.                     |

---

## Database

| Variable       | Default                         | Description                                                                                                             |
| -------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | SQLite at `/app/data/db.sqlite` | PostgreSQL connection string. Omit to use the default SQLite database. Prefix must be `postgres://` or `postgresql://`. |

### SQLite (default)

No configuration needed. The database file is created automatically at `/app/data/db.sqlite` inside the container. Ensure the Docker volume is mounted to persist data across restarts.

### PostgreSQL

Set `DATABASE_URL` to your PostgreSQL connection string:

```bash
DATABASE_URL=postgres://user:password@db-host:5432/awaitstep
```

Migrations run automatically on startup.

---

## Frontend (development only)

These variables are only needed when running the frontend dev server separately from the API (e.g. during local development with `pnpm dev`).

| Variable       | Description                                            |
| -------------- | ------------------------------------------------------ |
| `VITE_API_URL` | URL of the API server as seen from the browser.        |
| `VITE_APP_URL` | URL of the frontend app.                               |
| `CORS_ORIGIN`  | Allowed CORS origin for API requests from the browser. |

In the Docker deployment, the frontend is served by the same process as the API on port 8080. These variables are not needed in production.

---

## Generating secrets

```bash
# TOKEN_ENCRYPTION_KEY
openssl rand -hex 32

# BETTER_AUTH_SECRET
openssl rand -hex 32
```
