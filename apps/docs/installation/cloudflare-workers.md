# Deploy on Cloudflare Workers

Run the entire AwaitStep control plane on Cloudflare — no Node.js server, no Docker, no VPS. Your workflows still deploy to Cloudflare Workflows as before; what changes is where the builder UI and API run.

## Prerequisites

- **Cloudflare account** — Workers Paid plan (required for D1)
- **Node.js 18+** and **pnpm 9+** — build tools only, not needed at runtime
- **wrangler CLI** — `npm i -g wrangler && wrangler login`

## Quick Start

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
./scripts/cf-install.sh
```

The script will:

1. Build all packages
2. Create a D1 database and apply migrations
3. Generate encryption keys and set them as Worker secrets
4. Prompt for optional email (Resend) and OAuth (GitHub/Google) config
5. Deploy the API Worker and Web Worker
6. Print the URLs

Open the printed Web URL to get started.

## Manual Setup

### 1. Install and build

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
pnpm install
pnpm build
```

### 2. Create D1 database

```bash
cd apps/api
pnpm d1:create
```

Copy the `database_id` from the output and paste it into `apps/api/wrangler.jsonc` (replace `__D1_DATABASE_ID__`).

### 3. Apply migrations

```bash
pnpm d1:migrate
```

### 4. Set secrets

```bash
# Required
openssl rand -hex 32 | wrangler secret put TOKEN_ENCRYPTION_KEY
openssl rand -hex 32 | wrangler secret put BETTER_AUTH_SECRET

# Optional — magic link email
wrangler secret put RESEND_API_KEY

# Optional — OAuth
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

### 5. Deploy API Worker

```bash
cd apps/api
pnpm deploy:cf
```

Note the printed URL (e.g. `https://awaitstep-api.yoursubdomain.workers.dev`).

### 6. Configure and deploy Web Worker

Edit `apps/web/wrangler.jsonc`:

- Set `API_URL` to the API Worker URL from step 5
- Set `MAGIC_LINK_ENABLED` to `"true"` if Resend is configured

```bash
cd apps/web
pnpm deploy:cf
```

Note the printed URL (e.g. `https://awaitstep-web.yoursubdomain.workers.dev`).

### 7. Set CORS origin

```bash
cd apps/api
echo "https://awaitstep-web.yoursubdomain.workers.dev" | wrangler secret put CORS_ORIGIN
```

### 8. Verify

```bash
curl https://awaitstep-api.yoursubdomain.workers.dev/api/health
# → {"status":"ok","runtime":"workers"}
```

Open the Web URL in your browser.

## Architecture

```
Browser
  │
  ├── static assets (JS/CSS) ──── Web Worker (TanStack Start SSR)
  │                                    │
  ├── /api/* ──────────────────── service binding ──── API Worker (Hono)
  │                                                       │
  └── SSR loaders ─────────────── service binding ────────┘
                                                          │
                                                         D1 (SQLite)
```

- **Two Workers** — Web (SSR + assets) and API (Hono + auth + D1), linked via a Cloudflare service binding
- **Single origin** — the browser always talks to the Web Worker; `/api/*` is proxied internally to the API Worker with zero public-HTTP latency
- **D1** — Cloudflare's managed SQLite database, using the same schema as the self-hosted SQLite option
- **No CORS issues** — browser sees one origin; service binding bypasses the public network

## Environment Reference

### API Worker

| Name                   | Required | Description                                                |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `TOKEN_ENCRYPTION_KEY` | Yes      | AES-256-GCM key for encrypting stored tokens (64-char hex) |
| `BETTER_AUTH_SECRET`   | Yes      | Session signing secret (64-char hex)                       |
| `CORS_ORIGIN`          | Yes      | Web Worker's public URL                                    |
| `BETTER_AUTH_URL`      | No       | Auto-derived from request; set for custom domains          |
| `RESEND_API_KEY`       | No       | Enables magic-link email via Resend                        |
| `RESEND_FROM_EMAIL`    | No       | Custom sender address                                      |
| `GITHUB_CLIENT_ID`     | No       | GitHub OAuth                                               |
| `GITHUB_CLIENT_SECRET` | No       | GitHub OAuth                                               |
| `GOOGLE_CLIENT_ID`     | No       | Google OAuth                                               |
| `GOOGLE_CLIENT_SECRET` | No       | Google OAuth                                               |
| `REGISTRY_URL`         | No       | Custom node registry URL (default: GitHub)                 |
| `APP_NAME`             | No       | Display name in UI and emails (default: AwaitStep)         |

### Web Worker

| Name                 | Required | Description                                         |
| -------------------- | -------- | --------------------------------------------------- |
| `API_URL`            | Yes      | API Worker's public URL (for browser-side requests) |
| `MAGIC_LINK_ENABLED` | No       | `"true"` to show magic-link form on sign-in page    |
| `GITHUB_ENABLED`     | No       | `"true"` to show GitHub OAuth button                |
| `GOOGLE_ENABLED`     | No       | `"true"` to show Google OAuth button                |

Secrets are set via `wrangler secret put <NAME>`. Vars are in `wrangler.jsonc`.

> **OAuth redirect URLs**: When configuring GitHub/Google OAuth apps, set the redirect URL to the **Web Worker** URL (e.g. `https://awaitstep-web.yoursubdomain.workers.dev`), not the API Worker. All `/api/auth/*` requests route through the Web Worker via the service binding.

## D1 Migrations

Migrations live in `packages/db/drizzle/sqlite/` and are applied automatically on every `deploy:cf` run. To apply manually:

```bash
cd apps/api
pnpm d1:migrate          # remote (production)
pnpm d1:migrate:local    # local (Miniflare)
```

After schema changes: `cd packages/db && pnpm db:generate` → commit the new `.sql` file → redeploy.

## Custom Domains

1. Add a custom domain to the **Web Worker** in the Cloudflare dashboard (Settings > Triggers > Custom Domains)
2. Add a custom domain to the **API Worker** (or use a single domain with path-based routing)
3. Update secrets:
   - `CORS_ORIGIN` on the API Worker → new Web domain
   - `API_URL` in `apps/web/wrangler.jsonc` → new API domain
4. Redeploy: `pnpm deploy:cf`

If using OAuth, update the redirect URLs in your GitHub/Google OAuth app settings.

## Updating

```bash
git pull
pnpm install
pnpm deploy:cf
```

Migrations are applied automatically during deploy.

## Health Checks

```
GET /api/health → {"status":"ok","runtime":"workers"}
```

## Troubleshooting

**"No sign-in methods configured"** — Set `MAGIC_LINK_ENABLED=true` in `apps/web/wrangler.jsonc` vars, or configure OAuth on the API Worker.

**Auth redirects fail / stuck on sign-in** — Verify `CORS_ORIGIN` on the API Worker matches the Web Worker URL exactly (including `https://`).

**"Database not found"** — Check `database_id` in `apps/api/wrangler.jsonc` matches your D1 database (`wrangler d1 list`).

**Deploy stream disconnects** — Retry the deploy. Check API Worker logs: `wrangler tail awaitstep-api`.

**SSR returns empty session** — The Web Worker's `apiFetch` uses the service binding (`env.API`), not the public URL. Verify the service binding in `apps/web/wrangler.jsonc` points to the correct API Worker name.

## Known Limitations

- **Local dev server** (in-canvas `wrangler dev`) is not available on the Workers track — use the Docker/Node track for local development
- **Request body limit** — 100 MB (Workers limit)
- **Cold starts** — ~200-400ms on first request after idle
- **Workers Paid plan required** for D1
- **Rate limiting** — uses in-memory store per isolate; not globally enforced across Workers instances. Provides per-isolate protection but determined attackers hitting different isolates could bypass limits. For production hardening, consider Cloudflare's native Rate Limiting product.
- **Direct API access** — `BETTER_AUTH_URL` is auto-derived from the request origin. All browser auth traffic should go through the Web Worker. If you expose the API Worker directly and users authenticate against both origins, set `BETTER_AUTH_URL` explicitly to the Web Worker's URL.
