---
title: Environment Variables
---

# Environment Variables

All configuration is passed to AwaitStep via environment variables in the `.env` file (or directly in `docker-compose.yml`).

## Security

These variables are required. The application will not start without them.

| Variable               | Description                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex string used to encrypt stored Cloudflare API tokens. Generate with `openssl rand -hex 32`.                               |
| `BETTER_AUTH_SECRET`   | Secret key for the auth library. Generate with `openssl rand -hex 32`.                                                               |
| `BETTER_AUTH_URL`      | The public URL of your AwaitStep instance, e.g. `https://workflows.example.com`. Used for OAuth redirect URIs and magic link emails. |

## Database

| Variable       | Default                    | Description                                                                               |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `file:/app/data/db.sqlite` | Database connection string. Omit for SQLite. Set to a `postgresql://` URL for PostgreSQL. |

See [Database](./database) for details.

## OAuth

Configure at least one auth provider. All fields within a provider are required if any field for that provider is set.

| Variable               | Description                    |
| ---------------------- | ------------------------------ |
| `GITHUB_CLIENT_ID`     | GitHub OAuth app client ID     |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID         |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret     |

To create a GitHub OAuth app: **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**. Set the callback URL to `<BETTER_AUTH_URL>/api/auth/callback/github`.

To create a Google OAuth client: **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID**. Set the redirect URI to `<BETTER_AUTH_URL>/api/auth/callback/google`.

## Email

| Variable         | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | API key for [Resend](https://resend.com). Required for magic link authentication. |

## Application

| Variable       | Default           | Description                                                             |
| -------------- | ----------------- | ----------------------------------------------------------------------- |
| `APP_NAME`     | `AwaitStep`       | Display name shown in the UI and email templates.                       |
| `REGISTRY_URL` | Built-in registry | URL of a custom node registry. Omit to use the default public registry. |

## Complete .env example

```bash
# ── Security ─────────────────────────────────────────────────────────────────
TOKEN_ENCRYPTION_KEY=your_64_char_hex_string_here
BETTER_AUTH_SECRET=another_64_char_hex_string_here
BETTER_AUTH_URL=https://workflows.example.com

# ── Database ──────────────────────────────────────────────────────────────────
# SQLite (default)
# PostgreSQL (uncomment and fill in to use)
# DATABASE_URL=postgresql://user:password@host:5432/awaitstep

# ── GitHub OAuth ──────────────────────────────────────────────────────────────
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ── Google OAuth ──────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── Magic Link ────────────────────────────────────────────────────────────────
RESEND_API_KEY=

# ── Application ───────────────────────────────────────────────────────────────
APP_NAME=AwaitStep
# REGISTRY_URL=https://your-custom-registry.example.com
```
