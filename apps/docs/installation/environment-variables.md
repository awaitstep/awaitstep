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

## Image storage

Uploaded profile photos and organization logos. By default the database keeps them; set `IMAGE_STORE=s3` to keep them in any S3-compatible bucket (Cloudflare R2, Amazon S3, Google Cloud Storage in S3 mode, MinIO). The bucket stays private: AwaitStep serves every image itself, at `/api/images/<id>`.

| Variable               | Default | Description                                                                                                |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `IMAGE_STORE`          | `db`    | `db` keeps images in the database; `s3` keeps them in the bucket below. Any other value stops startup.     |
| `S3_ENDPOINT`          | (none)  | With `s3`: the service's URL, e.g. `http://minio:9000` or `https://<account-id>.r2.cloudflarestorage.com`. |
| `S3_BUCKET`            | (none)  | With `s3`: the bucket name. Create it first.                                                               |
| `S3_ACCESS_KEY_ID`     | (none)  | With `s3`: an access key that can read, write and delete in the bucket.                                    |
| `S3_SECRET_ACCESS_KEY` | (none)  | With `s3`: its secret.                                                                                     |
| `S3_REGION`            | `auto`  | The bucket's region (`auto` suits R2 and MinIO).                                                           |

With `IMAGE_STORE=s3`, a missing `S3_*` setting stops startup. Images already stored are not moved when you switch stores.

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

## Network

| Variable               | Default | Description                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_SECRET` | (none)  | Shared with your reverse proxy, which sends it as `X-AwaitStep-Proxy` to prove it may name the client. At least 32 characters — generate with `openssl rand -hex 32`. The install script sets it. Without it, every user behind a proxy shares the proxy's rate limits. See [Reverse Proxy](./reverse-proxy#client-addresses-and-rate-limits). |
| `TRUSTED_PROXIES`      | (none)  | Managed platforms only: comma-separated address ranges (CIDR) of a load balancer that cannot add headers; `X-Forwarded-For` is read from those connections. Never include loopback or AwaitStep's own network. A malformed entry stops startup.                                                                                                |

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

# ── Image storage ─────────────────────────────────────────────────────────────
# The database keeps photos and logos (default). For a bucket instead:
# IMAGE_STORE=s3
# S3_ENDPOINT=http://minio:9000
# S3_BUCKET=awaitstep
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_REGION=auto

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
