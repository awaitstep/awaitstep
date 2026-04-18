# Deploy on Cloudflare Workers

This guide covers deploying AwaitStep to Cloudflare Workers — both the platform itself (API + Web workers) and the sandbox infrastructure that deploys user workflows.

## Architecture Overview

AwaitStep on Cloudflare consists of two Workers and a sandbox system:

```
┌─────────────────────┐     ┌─────────────────────┐
│   Web Worker        │────▶│   API Worker         │
│   (SSR + static)    │     │   (Hono + D1 + Auth) │
│                     │     │                      │
│   Service binding   │     │   Durable Objects    │
│   to API Worker     │     │   + Containers       │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │   Sandbox Container   │
                            │   (ephemeral)         │
                            │                       │
                            │   Runs wrangler to    │
                            │   deploy user         │
                            │   workflows           │
                            └───────────┬──────────┘
                                        │
                                        ▼
                            ┌──────────────────────┐
                            │   User Workflow       │
                            │   Worker              │
                            │   (CF Workflows)      │
                            └──────────────────────┘
```

- **Web Worker** — serves the frontend (React, SSR via Vite) and proxies `/api/*` requests to the API Worker via a [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).
- **API Worker** — runs the Hono backend with D1 (SQLite), Better Auth, token encryption, and the node registry.
- **Sandbox** — a Cloudflare Container (Durable Object backed by a Docker image) that runs `wrangler deploy` inside an ephemeral environment to deploy user-created workflows as standalone Workers.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) on the **Workers Paid plan** (required for Containers / Durable Objects)
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) (version specified in `packageManager` field of root `package.json`)
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)

### Cloudflare API Token Permissions

Create an API token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) with the following permissions:

| Permission                   | Access | Why                               |
| ---------------------------- | ------ | --------------------------------- |
| Account / Workers Scripts    | Edit   | Deploy API and Web Workers        |
| Account / Workers KV Storage | Edit   | Sandbox container state           |
| Account / D1                 | Edit   | Create/migrate the database       |
| Account / Workers Tail       | Read   | `wrangler tail` for log streaming |
| Account / Account Settings   | Read   | Account ID resolution             |

If using Containers (Sandbox), the token also needs:

- Account / Workers Scripts — Edit (covers container image uploads)

For user workflow deployments, users provide their **own** CF API token via the Connections page — that token is used inside the Sandbox to run `wrangler deploy` for their workflows.

## Configuration Reference

### Secrets

These are sensitive values. In GitHub Actions, store them under **Settings > Secrets and variables > Actions > Secrets**. For manual deployment, they are set via `wrangler secret put`.

| Name                      | Required | Description                                                                             |
| ------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`    | Yes      | CF API token with Workers, D1, and Containers permissions                               |
| `CLOUDFLARE_ACCOUNT_ID`   | Yes      | Your Cloudflare account ID                                                              |
| `CF_TOKEN_ENCRYPTION_KEY` | Yes      | AES-256-GCM key for encrypting stored credentials. Generate with `openssl rand -hex 32` |
| `CF_BETTER_AUTH_SECRET`   | Yes      | Session signing key for Better Auth. Generate with `openssl rand -hex 32`               |
| `CF_RESEND_API_KEY`       | No       | [Resend](https://resend.com) API key — enables magic link sign-in                       |
| `CF_RESEND_FROM_EMAIL`    | No       | Sender email address (e.g., `noreply@example.com`)                                      |
| `CF_GITHUB_CLIENT_ID`     | No       | GitHub OAuth app client ID                                                              |
| `CF_GITHUB_CLIENT_SECRET` | No       | GitHub OAuth app client secret                                                          |
| `CF_GOOGLE_CLIENT_ID`     | No       | Google OAuth client ID                                                                  |
| `CF_GOOGLE_CLIENT_SECRET` | No       | Google OAuth client secret                                                              |

### Variables

Non-sensitive configuration. In GitHub Actions, store under **Settings > Secrets and variables > Actions > Variables**.

| Name                         | Required | Default                     | Description                                                                                                     |
| ---------------------------- | -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `CF_D1_DATABASE_ID`          | Yes      | —                           | D1 database UUID                                                                                                |
| `CF_API_WORKER_URL`          | Yes      | —                           | Public URL of the deployed API Worker (e.g., `https://awaitstep-api.account.workers.dev`)                       |
| `CF_DEPLOY_ENABLED`          | No       | `false`                     | Set to `true` to enable automatic deploys on push                                                               |
| `CF_API_WORKER_NAME`         | No       | `awaitstep-api`             | API Worker name                                                                                                 |
| `CF_WEB_WORKER_NAME`         | No       | `awaitstep-web`             | Web Worker name                                                                                                 |
| `CF_APP_NAME`                | No       | `AwaitStep`                 | Application display name                                                                                        |
| `CF_WEB_CUSTOM_DOMAIN`       | No       | —                           | Custom domain for the web worker (e.g., `app.example.com`)                                                      |
| `CF_WEB_ROUTE`               | No       | —                           | Route pattern (e.g., `app.example.com/*`)                                                                       |
| `CF_WEB_ROUTE_ZONE`          | No       | —                           | DNS zone name (required when using `CF_WEB_ROUTE`)                                                              |
| `CF_CONTAINER_INSTANCE_TYPE` | No       | `basic`                     | Sandbox container size: `lite`, `basic`, or `standard`                                                          |
| `CF_CONTAINER_MAX_INSTANCES` | No       | `20`                        | Maximum concurrent sandbox containers                                                                           |
| `CF_SANDBOX_DEPLOY_TIMEOUT`  | No       | `300`                       | Max deploy time in seconds before the sandbox is force-destroyed                                                |
| `CF_SANDBOX_SLEEP_AFTER`     | No       | `5m`                        | Sandbox idle sleep duration (e.g., `5m`, `10m`) — the Durable Object hibernates after this period of inactivity |
| `CF_COMPATIBILITY_DATE`      | No       | Set in `wrangler.jsonc`     | Override the Workers compatibility date                                                                         |
| `CF_REGISTRY_URL`            | No       | GitHub raw URL              | Custom node registry URL                                                                                        |
| `CF_CORS_ORIGIN`             | No       | Derived from web worker URL | CORS origin override                                                                                            |

## Quick Start

```bash
# 1. Clone and enter the project
git clone https://github.com/awaitstep/awaitstep.git && cd awaitstep

# 2. Log in to Cloudflare
wrangler login

# 3. Run the install script
./scripts/cf-install.sh
```

The script will prompt for:

- **Worker name prefix** — determines your `.workers.dev` URLs (e.g., `myapp` produces `myapp-api.workers.dev` and `myapp-web.workers.dev`)
- **Resend API key** — optional, enables magic link email sign-in
- **OAuth credentials** — optional GitHub and Google OAuth app credentials

The script will:

1. Build all packages
2. Create a D1 database and apply migrations
3. Generate encryption keys and set them as Worker secrets
4. Deploy the API Worker and Web Worker
5. Set CORS origin
6. Print the URLs

Open the printed Web URL to get started.

## Manual Setup

### 1. Install and build

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
pnpm install --frozen-lockfile
pnpm build
```

### 2. Create D1 database

```bash
cd apps/api
pnpm exec wrangler d1 create awaitstep
```

Copy the `database_id` from the output and paste it into `apps/api/wrangler.jsonc` (replace `__D1_DATABASE_ID__`).

### 3. Apply migrations

```bash
pnpm exec wrangler d1 migrations apply awaitstep --remote
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
pnpm exec wrangler deploy
```

Note the printed URL (e.g. `https://awaitstep-api.yoursubdomain.workers.dev`).

### 6. Configure and deploy Web Worker

Edit `apps/web/wrangler.jsonc`:

- Replace `__API_WORKER_URL__` with the API Worker URL from step 5
- Set `MAGIC_LINK_ENABLED` to `"true"` if Resend is configured

```bash
cd apps/web
BUILD_TARGET=cf pnpm build
pnpm exec wrangler deploy
```

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

### Redeploying After Changes

```bash
# Redeploy both workers
pnpm deploy:cf

# Or individually
cd apps/api && pnpm deploy:cf
cd apps/web && pnpm deploy:cf
```

### Useful Commands

```bash
# Tail API Worker logs
wrangler tail awaitstep-api

# Tail Web Worker logs
wrangler tail awaitstep-web

# Check D1 database info
wrangler d1 info awaitstep

# Apply new migrations
cd apps/api && pnpm d1:migrate

# Update a secret
echo "new-value" | wrangler secret put SECRET_NAME --name awaitstep-api
```

## Automated Deployment (GitHub Actions)

The workflow at `.github/workflows/deploy-cf.yml` automates the entire deployment pipeline.

### Setup

1. **Create a D1 database** (one-time, before first deploy):

   ```bash
   wrangler d1 create awaitstep
   ```

   Note the `database_id` from the output.

2. **Configure GitHub repository settings**:

   **Secrets** (Settings > Secrets and variables > Actions > New repository secret):

   ```
   CLOUDFLARE_API_TOKEN          # CF API token
   CLOUDFLARE_ACCOUNT_ID         # CF account ID
   CF_TOKEN_ENCRYPTION_KEY       # openssl rand -hex 32
   CF_BETTER_AUTH_SECRET         # openssl rand -hex 32
   ```

   **Variables** (Settings > Secrets and variables > Actions > New repository variable):

   ```
   CF_D1_DATABASE_ID             # UUID from step 1
   CF_API_WORKER_URL             # e.g., https://awaitstep-api.<account>.workers.dev
   CF_DEPLOY_ENABLED             # "true" to enable auto-deploy
   ```

   Add optional secrets/variables from the [Configuration Reference](#configuration-reference) as needed (email, OAuth, custom domains, etc.).

3. **Deploy** — either push to trigger an automatic deploy (if `CF_DEPLOY_ENABLED=true`) or trigger manually.

### Triggering a Deploy

**Manual trigger** via GitHub UI or CLI:

```bash
# Deploy everything
gh workflow run deploy-cf.yml --ref main -f target=all

# Deploy only the API Worker
gh workflow run deploy-cf.yml --ref main -f target=api

# Deploy only the Web Worker
gh workflow run deploy-cf.yml --ref main -f target=web
```

**Automatic trigger**: When `CF_DEPLOY_ENABLED` is set to `true`, the workflow runs on:

- Push to `main` (via `workflow_call` from the release pipeline)
- Called by `promote-release.yml` when a stable release is cut

### Pipeline Steps

```
1. Checkout + install dependencies
         │
2. Validate required secrets/variables
         │
3. Patch wrangler configs (scripts/patch-wrangler-config.mjs)
   ├── API: inject D1 database ID, worker name, container config, vars
   └── Web: inject API URL, service binding, auth flags, routing
         │
4. Build all packages (pnpm build --filter='./packages/*')
         │
5. Deploy API Worker
   ├── pnpm build (TSUp → dist/)
   ├── pnpm d1:migrate (apply Drizzle migrations remotely)
   └── wrangler deploy --config wrangler.json
         │
6. Sync API Worker secrets
   └── TOKEN_ENCRYPTION_KEY, BETTER_AUTH_SECRET, CORS_ORIGIN, + optional
         │
7. Deploy Web Worker
   ├── BUILD_TARGET=cf pnpm build (Vite + Cloudflare plugin → dist/server/)
   └── wrangler deploy --config dist/server/wrangler.json
```

### Config Patching

The deploy workflow does not modify committed files directly. Instead, `scripts/patch-wrangler-config.mjs` reads environment variables and produces deployment-ready configs:

- **API Worker**: reads `apps/api/wrangler.jsonc` (with `__D1_DATABASE_ID__` placeholder), applies all `CF_*` environment variables, and writes `apps/api/wrangler.json` (the actual deploy artifact).
- **Web Worker**: reads `apps/web/wrangler.jsonc`, patches it in place (Vite reads this during `BUILD_TARGET=cf` build), and the Vite Cloudflare plugin produces `dist/server/wrangler.json`.

Auth method flags are automatically derived from secret presence:

- `CF_RESEND_API_KEY` set → `MAGIC_LINK_ENABLED=true`
- `CF_GITHUB_CLIENT_ID` set → `GITHUB_ENABLED=true`
- `CF_GOOGLE_CLIENT_ID` set → `GOOGLE_ENABLED=true`

### Deployment Targets

The workflow supports selective deployment via the `target` input:

| Target          | What deploys                      |
| --------------- | --------------------------------- |
| `all` (default) | API Worker + secrets + Web Worker |
| `api`           | API Worker + secrets only         |
| `web`           | Web Worker only                   |

## Wrangler Configuration

### API Worker (`apps/api/wrangler.jsonc`)

```jsonc
{
  "name": "awaitstep-api",
  "main": "src/entry/worker.ts",
  "compatibility_date": "2026-04-14",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "workers_dev": false,
  "preview_urls": false,

  // D1 database — __D1_DATABASE_ID__ is replaced at deploy time
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "awaitstep",
      "database_id": "__D1_DATABASE_ID__",
      "migrations_dir": "../../packages/db/drizzle/sqlite",
    },
  ],

  // Sandbox: Durable Object backed by a Docker container
  "durable_objects": {
    "bindings": [{ "class_name": "Sandbox", "name": "SANDBOX" }],
  },
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile.sandbox",
      "instance_type": "basic", // lite | basic | standard
      "max_instances": 20,
    },
  ],
  "migrations": [{ "new_sqlite_classes": ["Sandbox"], "tag": "v1" }],

  "vars": {
    "REGISTRY_URL": "https://raw.githubusercontent.com/awaitstep/awaitstep/main/registry",
    "APP_NAME": "AwaitStep",
  },
}
```

Key points:

- `workers_dev: false` and `preview_urls: false` disable the default `.workers.dev` URL and preview URLs — routing is controlled explicitly.
- The `containers` block defines the Sandbox Docker image. Instance type `basic` (1/4 vCPU, 1 GiB RAM, 4 GB disk) is the minimum for running wrangler + npm install + esbuild.
- D1 migrations live in `packages/db/drizzle/sqlite/` and are applied with `wrangler d1 migrations apply`.

### Web Worker (`apps/web/wrangler.jsonc`)

```jsonc
{
  "name": "awaitstep-web",
  "main": "src/worker.ts",
  "compatibility_date": "2026-04-14",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },

  // Service binding — proxies /api/* to the API Worker without CORS
  "services": [{ "binding": "API", "service": "awaitstep-api" }],

  "vars": {
    "API_URL": "__API_WORKER_URL__",
    "MAGIC_LINK_ENABLED": "true",
    "GITHUB_ENABLED": "false",
    "GOOGLE_ENABLED": "false",
  },
}
```

The Web Worker proxies `/api/*` requests to the API Worker via the service binding (`env.API.fetch(request)`), which avoids cross-origin issues entirely.

### Sandbox Dockerfile (`apps/api/Dockerfile.sandbox`)

```dockerfile
FROM docker.io/cloudflare/sandbox:0.8.11

# Pre-install wrangler so deploys don't pay ~30s npm install cost
RUN npm install -g wrangler@latest

RUN mkdir -p /workspace
WORKDIR /workspace

EXPOSE 8787
```

The Docker image is cached across runs. Each user workflow deployment creates a new ephemeral container from this image, uses it to run `wrangler deploy`, and destroys it when done.

## Sandbox Deployment Flow

When a user deploys a workflow from the canvas, the following happens:

```
POST /api/workflows/:id/deploy
         │
1. prepareDeploy()
   ├── Load workflow IR from database
   ├── Resolve {{global.env.NAME}} variable references
   ├── Validate IR against provider schema
   └── Verify provider credentials (Cloudflare API token)
         │
2. Provider.generate(ir, config) → GeneratedArtifact
   ├── Generate TypeScript workflow code
   └── Transpile to JavaScript via sucrase
         │
3. SandboxWranglerDeployer.deploy(artifact, options)
   ├── Create ephemeral Sandbox container
   ├── Write generated-worker.ts to /workspace/
   ├── Write wrangler.json to /workspace/
   ├── npm install (if workflow has external dependencies)
   ├── wrangler deploy (using user's CF credentials)
   ├── wrangler secret put (for each workflow secret)
   └── Destroy Sandbox container
         │
4. Record deployment in database
   └── Store worker URL, deployment ID, status
```

The Sandbox container has a hard timeout (default: **5 minutes**, configurable via `CF_SANDBOX_DEPLOY_TIMEOUT`). If deployment hasn't completed by then, the container is force-destroyed and the deploy fails. The Durable Object enters hibernation after a period of inactivity (default: `5m`, configurable via `CF_SANDBOX_SLEEP_AFTER`) to save resources.

### Deploy Progress Stages

The `POST /api/workflows/:id/deploy-stream` endpoint uses Server-Sent Events (SSE) to stream real-time progress:

| Stage               | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `WRITING_FILES`     | Writing generated worker code and wrangler.json to the container |
| `INSTALLING_DEPS`   | Running `npm install` for external dependencies                  |
| `DEPLOYING`         | Running `wrangler deploy` — streams wrangler output line by line |
| `UPLOADING_SECRETS` | Running `wrangler secret put` for each workflow secret           |

### Worker Takedown

Deployed user workflows can be removed via `POST /api/workflows/:id/takedown`. This spins up a fresh Sandbox container and runs:

```bash
npx wrangler delete --name <worker-name> --force
```

### Security Measures

- **Secret key validation** — only keys matching `^[a-zA-Z_][a-zA-Z0-9_]*$` are accepted for `wrangler secret put`
- **Sensitive string redaction** — error messages have long alphanumeric strings replaced with `[REDACTED]`
- **Filename sanitization** — artifact filenames are stripped of path traversal components
- **Hard kill timer** — container is force-destroyed after the deploy timeout regardless of process state
- **Credential isolation** — user CF credentials are passed as environment variables, never written to disk

### Supported Resource Bindings

User workflows can use any of these Cloudflare resource bindings:

| Binding Type      | Wrangler Key                | Requires Resource ID   |
| ----------------- | --------------------------- | ---------------------- |
| KV Namespace      | `kv_namespaces`             | Yes                    |
| D1 Database       | `d1_databases`              | Yes                    |
| R2 Bucket         | `r2_buckets`                | No (uses binding name) |
| Queue             | `queues.producers`          | No (uses binding name) |
| Service Binding   | `services`                  | No (uses binding name) |
| Workers AI        | `ai`                        | No                     |
| Vectorize Index   | `vectorize`                 | Yes (index name)       |
| Analytics Engine  | `analytics_engine_datasets` | No                     |
| Hyperdrive        | `hyperdrive`                | Yes                    |
| Browser Rendering | `browser`                   | No                     |

Additional deployment options per workflow:

| Option          | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| `cronTriggers`  | Cron expressions for scheduled execution (e.g., `["0 * * * *"]`) |
| `routes`        | Custom route patterns with zone names                            |
| `customDomains` | Custom domain bindings                                           |
| `placement`     | Smart placement mode (`smart` for automatic region selection)    |
| `limits.cpuMs`  | CPU time limit per invocation (minimum 10ms)                     |
| `observability` | Enable/disable observability with optional head sampling rate    |
| `logpush`       | Enable Logpush integration                                       |
| `previewUrls`   | Enable/disable preview URLs                                      |
| `workersDev`    | Enable/disable `.workers.dev` URL                                |

### Container Instance Types

| Type       | vCPU | Memory  | Disk  | Use Case                               |
| ---------- | ---- | ------- | ----- | -------------------------------------- |
| `lite`     | 1/8  | 256 MiB | 1 GB  | Too small for wrangler                 |
| `basic`    | 1/4  | 1 GiB   | 4 GB  | Default, handles most workflows        |
| `standard` | 1    | 4 GiB   | 10 GB | Large workflows with many dependencies |

The `basic` tier is the minimum — `lite` doesn't have enough memory for wrangler + npm install + esbuild.

## Custom Domains

### Using CF_WEB_CUSTOM_DOMAIN

The simplest way to use a custom domain. Set `CF_WEB_CUSTOM_DOMAIN` to your domain (e.g., `app.example.com`) and the deploy pipeline will configure the Worker route automatically.

### Using CF_WEB_ROUTE

For more control, use `CF_WEB_ROUTE` with `CF_WEB_ROUTE_ZONE`:

```
CF_WEB_ROUTE=app.example.com/*
CF_WEB_ROUTE_ZONE=example.com
```

If `CF_WEB_ROUTE` is set, it takes precedence over `CF_WEB_CUSTOM_DOMAIN`.

> **OAuth redirect URLs**: When configuring GitHub/Google OAuth apps, set the redirect URL to the **Web Worker** URL, not the API Worker. All `/api/auth/*` requests route through the Web Worker via the service binding.

## Authentication Setup

At least one sign-in method must be configured.

### Magic Link (Email)

Set `CF_RESEND_API_KEY` and optionally `CF_RESEND_FROM_EMAIL`. The Web Worker will show the magic link sign-in option.

### GitHub OAuth

1. Create a GitHub OAuth app at https://github.com/settings/developers
2. Set the callback URL to `<WEB_WORKER_URL>/api/auth/callback/github`
3. Set `CF_GITHUB_CLIENT_ID` and `CF_GITHUB_CLIENT_SECRET`

### Google OAuth

1. Create credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `<WEB_WORKER_URL>/api/auth/callback/google` as an authorized redirect URI
3. Set `CF_GOOGLE_CLIENT_ID` and `CF_GOOGLE_CLIENT_SECRET`

## Local Development

```bash
# Start API server (Node.js + SQLite, uses NodeWranglerDeployer)
cd apps/api && pnpm dev

# Start Web dev server
cd apps/web && pnpm dev
```

The local API server uses **better-sqlite3** instead of D1 and **NodeWranglerDeployer** instead of the Sandbox — it spawns `wrangler deploy` as a child process in a temp directory.

Required env vars:

```bash
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
# BETTER_AUTH_SECRET is auto-generated in dev mode if not set
```

## Troubleshooting

**"Missing required configuration" in CI** — Check that all required secrets and variables are configured in GitHub repository settings.

**Sandbox deploy fails with timeout** — The container has a configurable timeout (default 300s). Try `CF_CONTAINER_INSTANCE_TYPE=standard` or increase `CF_SANDBOX_DEPLOY_TIMEOUT`.

**D1 migration errors** — Run `wrangler d1 migrations list awaitstep --remote` to check status, then `cd apps/api && pnpm d1:migrate`.

**CORS errors** — The `CORS_ORIGIN` secret on the API Worker must match the Web Worker's URL exactly. If using a custom domain, set `CF_CORS_ORIGIN`.

**Auth redirects fail** — Verify `CORS_ORIGIN` matches the Web Worker URL including `https://`.

**Deploy stream disconnects** — Retry the deploy. Check API Worker logs: `wrangler tail awaitstep-api`.

**Secret rotation** — Update the `CF_*` secret in GitHub and redeploy. The workflow only sets secrets that don't already exist — to force rotation, delete first: `wrangler secret delete SECRET_NAME --name awaitstep-api`.

## Release Pipeline Integration

```
Push to main
     │
     ▼
release.yml (release-please)
     │ Creates version tags
     ▼
promote-release.yml (scheduled or manual)
     │ Promotes beta → stable
     ├── docker-publish.yml (publishes sandbox image)
     └── deploy-cf.yml (deploys to Cloudflare)
```

Set `CF_DEPLOY_ENABLED=true` as a GitHub variable to enable automatic deployment on release.

## Known Limitations

- **Request body limit** — 100 MB (Workers limit)
- **Cold starts** — ~200-400ms on first request after idle
- **Workers Paid plan required** for D1 and Containers
- **Rate limiting** — uses in-memory store per isolate; not globally enforced across Workers instances
