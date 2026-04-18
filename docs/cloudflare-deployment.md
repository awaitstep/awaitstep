# Cloudflare Deployment

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

## Manual Deployment

The interactive install script handles everything from D1 database creation to secret generation.

### Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url> && cd awaitstep

# 2. Log in to Cloudflare
wrangler login

# 3. Run the install script
./scripts/cf-install.sh
```

The script will prompt for:

- **Worker name prefix** — determines your `.workers.dev` URLs (e.g., `myapp` produces `myapp-api.workers.dev` and `myapp-web.workers.dev`)
- **Resend API key** — optional, enables magic link email sign-in
- **OAuth credentials** — optional GitHub and Google OAuth app credentials

### What the Script Does

1. **Checks prerequisites** — verifies `wrangler`, `pnpm`, and `wrangler login` are available.

2. **Installs dependencies and builds** — runs `pnpm install` and `pnpm build` for all packages.

3. **Creates a D1 database** — runs `wrangler d1 create <prefix>` and extracts the database UUID.

4. **Patches wrangler configs** — uses `sed` to replace placeholder values (`__D1_DATABASE_ID__`, worker names) in `apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc`.

5. **Applies D1 migrations** — runs `wrangler d1 migrations apply <prefix> --remote` to set up the database schema.

6. **Generates and sets secrets** — creates random encryption keys via `openssl rand -hex 32` and pushes them (plus any OAuth/email keys you provided) to the API Worker with `wrangler secret put`.

7. **Deploys API Worker** — runs `wrangler deploy` in `apps/api/`.

8. **Deploys Web Worker** — patches the API URL into the web config, sets auth method flags based on which credentials were provided, builds with `BUILD_TARGET=cf pnpm build`, and deploys.

9. **Sets CORS origin** — pushes the Web Worker URL as `CORS_ORIGIN` on the API Worker.

### Manual Step-by-Step (Without the Script)

If you prefer to run each step yourself:

```bash
# Build everything
pnpm install --frozen-lockfile
pnpm build

# Create D1 database
cd apps/api
pnpm exec wrangler d1 create awaitstep
# Note the database_id from the output

# Edit apps/api/wrangler.jsonc — replace __D1_DATABASE_ID__ with your UUID

# Apply migrations
pnpm exec wrangler d1 migrations apply awaitstep --remote

# Generate secrets
TOKEN_KEY=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

# Set secrets on API Worker
echo "$TOKEN_KEY" | pnpm exec wrangler secret put TOKEN_ENCRYPTION_KEY
echo "$AUTH_SECRET" | pnpm exec wrangler secret put BETTER_AUTH_SECRET

# Deploy API Worker
pnpm exec wrangler deploy

# Note the API Worker URL from the output, then:
cd ../web

# Edit apps/web/wrangler.jsonc — replace __API_WORKER_URL__ with the API URL

# Build and deploy Web Worker
BUILD_TARGET=cf pnpm build
pnpm exec wrangler deploy

# Set CORS origin on API Worker
cd ../api
echo "https://awaitstep-web.<account>.workers.dev" | pnpm exec wrangler secret put CORS_ORIGIN
```

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

This is useful when you only changed frontend code (deploy `web`) or only backend code (deploy `api`).

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

## Sandbox Deployment Flow (User Workflows)

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

The generated `wrangler.json` for user workflows includes:

- A `workflows` binding (Cloudflare Workflows runtime)
- Any resource bindings the workflow uses (KV, D1, R2, Queues, AI, etc.)
- Environment variables from the workflow configuration
- `compatibility_flags: ["nodejs_compat"]` by default

The Sandbox container has a hard timeout (default: **5 minutes**, configurable via `CF_SANDBOX_DEPLOY_TIMEOUT`). If deployment hasn't completed by then, the container is force-destroyed and the deploy fails. The Durable Object enters hibernation after a period of inactivity (default: `5m`, configurable via `CF_SANDBOX_SLEEP_AFTER`) to save resources.

### Deploy Progress Stages

The `POST /api/workflows/:id/deploy-stream` endpoint uses Server-Sent Events (SSE) to stream real-time progress. The `SandboxWranglerDeployer` reports these stages via the `onProgress` callback:

| Stage               | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `WRITING_FILES`     | Writing generated worker code and wrangler.json to the container |
| `INSTALLING_DEPS`   | Running `npm install` for external dependencies                  |
| `DEPLOYING`         | Running `wrangler deploy` — streams wrangler output line by line |
| `UPLOADING_SECRETS` | Running `wrangler secret put` for each workflow secret           |

Each stage sends `{ stage, message }` events. The `DEPLOYING` stage streams wrangler's stdout in real-time so the user can see upload progress.

### Worker Takedown

Deployed user workflows can be removed via `POST /api/workflows/:id/takedown`. This calls `SandboxWranglerDeployer.deleteWorker()`, which spins up a fresh Sandbox container and runs:

```bash
npx wrangler delete --name <worker-name> --force
```

The container is destroyed after the deletion completes.

### Security Measures

The sandbox deployer includes several safety mechanisms:

- **Secret key validation** — only keys matching `^[a-zA-Z_][a-zA-Z0-9_]*$` are accepted for `wrangler secret put`
- **Sensitive string redaction** — error messages from the sandbox have long alphanumeric strings (potential tokens) replaced with `[REDACTED]` before being stored or returned to the client
- **Filename sanitization** — artifact filenames are stripped of path traversal components (e.g., `../../etc/passwd` → rejected)
- **Hard kill timer** — the container is force-destroyed after the deploy timeout (default 5 minutes, configurable via `CF_SANDBOX_DEPLOY_TIMEOUT`) regardless of process state, preventing resource leaks
- **Credential isolation** — user CF credentials are passed as environment variables to the `wrangler deploy` command inside the sandbox, never written to disk

### Supported Resource Bindings

User workflows can use any of these Cloudflare resource bindings. They are configured via the workflow's deployment settings and written into the generated `wrangler.json`:

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

Additional deployment options available per workflow:

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

This creates a route pattern with an explicit zone, which is needed when the domain is in a different Cloudflare zone.

If `CF_WEB_ROUTE` is set, it takes precedence over `CF_WEB_CUSTOM_DOMAIN`.

## Authentication Setup

AwaitStep uses [Better Auth](https://www.better-auth.com/) for authentication. At least one sign-in method must be configured.

### Magic Link (Email)

Set `CF_RESEND_API_KEY` and optionally `CF_RESEND_FROM_EMAIL`. The Web Worker will show the magic link sign-in option.

### GitHub OAuth

1. Create a GitHub OAuth app at https://github.com/settings/developers
2. Set the callback URL to `<API_WORKER_URL>/api/auth/callback/github`
3. Set `CF_GITHUB_CLIENT_ID` and `CF_GITHUB_CLIENT_SECRET`

### Google OAuth

1. Create credentials in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `<API_WORKER_URL>/api/auth/callback/google` as an authorized redirect URI
3. Set `CF_GOOGLE_CLIENT_ID` and `CF_GOOGLE_CLIENT_SECRET`

## Local Development

AwaitStep supports local development with Cloudflare-like behavior using two different deployers:

### Running Locally with CF Emulation

```bash
# Start API server (Node.js + SQLite, uses NodeWranglerDeployer)
cd apps/api && pnpm dev

# Start Web dev server with CF plugin
cd apps/web && pnpm dev:cf
# Or standard dev server
cd apps/web && pnpm dev
```

The local API server (`apps/api/src/entry/dev.ts`) uses:

- **better-sqlite3** instead of D1
- **NodeWranglerDeployer** instead of `SandboxWranglerDeployer` — spawns `wrangler deploy` as a child process in a temp directory rather than using a Sandbox container
- Auto-applies Drizzle migrations on startup
- Reads env vars from `process.env` (use a `.env` file or export them)

Required env vars for local development:

```bash
TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
# BETTER_AUTH_SECRET is auto-generated in dev mode if not set
```

## Troubleshooting

### "Missing required configuration" in CI

The workflow validates that all required secrets and variables are set before deploying. Check that these are configured in your GitHub repository settings:

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_TOKEN_ENCRYPTION_KEY`, `CF_BETTER_AUTH_SECRET`
- Variables: `CF_D1_DATABASE_ID`, `CF_API_WORKER_URL`

### Sandbox deploy fails with timeout

The Sandbox container has a configurable timeout (default 300 seconds). Common causes:

- `npm install` is slow due to many dependencies — consider reducing the dependency count
- Container instance type is too small — try `CF_CONTAINER_INSTANCE_TYPE=standard`
- Network issues inside the container
- Timeout too short — increase `CF_SANDBOX_DEPLOY_TIMEOUT` (value in seconds, e.g., `600` for 10 minutes)

### D1 migration errors

```bash
# Check migration status
wrangler d1 migrations list awaitstep --remote

# Re-run migrations
cd apps/api && pnpm d1:migrate
```

### Checking Worker logs

```bash
# Real-time logs
wrangler tail awaitstep-api
wrangler tail awaitstep-web

# Filter by status
wrangler tail awaitstep-api --status error
```

### CORS errors

The `CORS_ORIGIN` secret on the API Worker must match the Web Worker's URL exactly. If you're using a custom domain, set `CF_CORS_ORIGIN` to `https://your-domain.com`.

### Secret rotation

To update a secret:

```bash
echo "new-value" | wrangler secret put SECRET_NAME --name awaitstep-api
```

In GitHub Actions, update the corresponding `CF_*` secret and redeploy. The workflow only sets secrets that don't already exist — to force a rotation, delete the secret first:

```bash
wrangler secret delete SECRET_NAME --name awaitstep-api
```

Then redeploy.

## Release Pipeline Integration

The deployment workflow integrates with the release pipeline:

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

To enable automatic deployment on release:

1. Set `CF_DEPLOY_ENABLED=true` as a GitHub variable
2. Ensure all required secrets and variables are configured
3. Pushes to `main` that create a release will automatically trigger deployment

## Key Files Reference

| File                                                          | Purpose                                               |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `.github/workflows/deploy-cf.yml`                             | GitHub Actions deployment workflow                    |
| `scripts/patch-wrangler-config.mjs`                           | Patches wrangler configs with env vars at deploy time |
| `scripts/cf-install.sh`                                       | Interactive manual deployment script                  |
| `apps/api/wrangler.jsonc`                                     | API Worker config template (committed)                |
| `apps/api/wrangler.json`                                      | API Worker deploy config (generated, not committed)   |
| `apps/api/src/entry/worker.ts`                                | API Worker entry point (Cloudflare)                   |
| `apps/api/src/entry/dev.ts`                                   | API Server entry point (Node.js local dev)            |
| `apps/api/Dockerfile.sandbox`                                 | Sandbox container image definition                    |
| `apps/web/wrangler.jsonc`                                     | Web Worker config template                            |
| `apps/web/src/worker.ts`                                      | Web Worker entry point                                |
| `apps/web/vite.config.ts`                                     | Vite config with optional Cloudflare plugin           |
| `packages/provider-cloudflare/src/deploy/sandbox-deployer.ts` | Deploys user workflows via Sandbox containers         |
| `packages/provider-cloudflare/src/deploy/node-deployer.ts`    | Deploys user workflows via local child process (dev)  |
| `packages/provider-cloudflare/src/deploy/deployer.ts`         | `WranglerDeployer` interface and shared utilities     |
| `packages/provider-cloudflare/src/wrangler-config.ts`         | Generates wrangler.json for user workflow Workers     |
| `packages/db/drizzle/sqlite/`                                 | D1 migration files                                    |
