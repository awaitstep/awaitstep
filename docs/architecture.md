# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (web)                          │
│                                                                 │
│  TanStack Start + TanStack Router + ReactFlow + Monaco Editor   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────┐   │
│  │  Canvas   │  │  Deploy   │  │  Trigger  │  │  Run Monitor │   │
│  │  Editor   │  │  Dialog   │  │  Dialog   │  │  + Canvas    │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────────┐
│                         API Server (api)                        │
│                                                                 │
│  Hono + better-auth                                             │
│                                                                 │
│  ┌───────────┐  ┌──────────┐  ┌──────┐  ┌───────────────────┐  │
│  │ Workflows │  │  Deploy   │  │ Runs │  │   Connections     │  │
│  │ + Versions│  │ + Stream  │  │      │  │   (encrypted)     │  │
│  └───────────┘  └────┬─────┘  └──┬───┘  └───────────────────┘  │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────────────────┐  │
│  │ Env Vars  │  │ API Keys │  │   Node Registry              │  │
│  │(encrypted)│  │ (scoped) │  │   (definitions + templates)  │  │
│  └───────────┘  └──────────┘  └──────────────────────────────┘  │
└───────────┬──────────┼───────────┼──────────────────────────────┘
            │          │           │
┌───────────▼──────────▼───────────▼──────────────────────────────┐
│                      Package Layer                              │
│                                                                 │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────────────┐  │
│  │ @awaitstep │  │  @awaitstep    │  │  @awaitstep           │  │
│  │ /ir        │  │  /codegen      │  │  /provider-cloudflare │  │
│  │            │  │                │  │                       │  │
│  │ Types      │  │ Provider       │  │ CF Adapter            │  │
│  │ Schemas    │──│ Interface      │──│ Wrangler Deploy       │  │
│  │ Validation │  │ DAG Traversal  │  │ CF API Client         │  │
│  │ Expressions│  │ Transpilation  │  │ Resource Browsers     │  │
│  └────────────┘  └────────────────┘  └───────────┬───────────┘  │
│                                                   │             │
│  ┌────────────────────────────────────┐           │             │
│  │ @awaitstep/db                      │           │             │
│  │                                    │           │             │
│  │ Drizzle ORM (SQLite + PostgreSQL)  │           │             │
│  │ Token Encryption (AES-256-GCM)     │           │             │
│  └────────────────────────────────────┘           │             │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │
                                          ┌─────────▼─────────┐
                                          │  Cloudflare API   │
                                          │                   │
                                          │  Workers          │
                                          │  Workflows        │
                                          │  KV / D1 / R2     │
                                          └───────────────────┘
```

## Package Dependency Flow

```
@awaitstep/ir ──► @awaitstep/codegen ──► @awaitstep/provider-cloudflare
                                                      │
@awaitstep/db (standalone)                            │
                                                      ▼
                                               Cloudflare API
```

Packages must not have circular dependencies.

## Data Flow: Build → Deploy → Run

```
1. BUILD
   Canvas State → WorkflowIR → generateWorkflow() → TypeScript → esbuild → JavaScript

2. DEPLOY
   Resolve workflow env vars (including {{global.env.NAME}} refs)
   → Validate required vars from node secret fields
   → JavaScript + wrangler.json (with vars) → wrangler deploy → Cloudflare Worker

3. TRIGGER
   POST /api/workflows/:id/trigger → CF API createInstance() → Workflow Run

4. MONITOR
   Poll CF API getInstanceStatus() → Update DB → SSE to frontend → Canvas overlay
```

## Key Design Decisions

### Runtime-Agnostic Core
All app code (API routes, business logic) is runtime-agnostic. No `process.env` or
Node-specific APIs outside of entry points. The Web Crypto API is used for token
encryption so it works on Node.js, Cloudflare Workers, Deno, and Bun.

### Provider Interface
The `WorkflowProvider` interface in `@awaitstep/codegen` defines the contract for
any workflow runtime provider. Provider-specific logic (API calls, credential
verification, deploy mechanics) lives entirely in `packages/provider-[name]`.

### Token Encryption
API tokens are encrypted at rest using AES-256-GCM via the Web Crypto API.
The `TokenCrypto` interface is injected into the database adapter, keeping the
encryption implementation decoupled from storage.

### IR-First Architecture
The WorkflowIR is the single source of truth. The canvas serializes to IR,
codegen reads IR, validation operates on IR, and versioning stores IR as JSON.

## Environment Variables

Two-tier model for managing secrets and configuration:

- **Global vars** — stored in `env_vars` table, encrypted at rest, scoped per user.
  Managed via Resources → Environment Variables (textarea `.env` editor).
- **Workflow vars** — stored as JSON in `workflows.envVars` column.
  Each has a name and value. Values can be direct or reference globals via `{{global.env.NAME}}`.

Resolution happens at deploy time:
1. Collect workflow env vars
2. Resolve `{{global.env.NAME}}` references by looking up the global table
3. Validate all required vars exist (from node `secret` config fields)
4. Inject resolved map into wrangler config as worker `vars`

Saving is always allowed — only deploy blocks on missing vars.

In node config fields, `{{env.NAME}}` emits a bare `env.NAME` runtime reference in
generated code. The `interface Env` is auto-populated with all referenced env var names.

## Custom Nodes

All nodes (builtin and custom) share the `NodeDefinition` model:
- `configSchema` — drives UI rendering via `DynamicFields` (string, number, boolean, select, secret, code, json, etc.)
- `outputSchema` — declares the shape of step results
- Templates — provider-specific code with `ctx.config.*`, `ctx.env.*`, `ctx.inputs.*` placeholders

Authoring flow:
1. `pnpm nodes:generate my_node` — scaffolds `nodes/my_node/node.json` + template
2. Edit definition and template code
3. `pnpm nodes:build` — validates, compiles, and bundles into `nodes/registry.json`
4. API serves definitions at `GET /api/nodes` and templates at `GET /api/nodes/templates`

The `NodeRegistry` class (in `@awaitstep/ir`) manages definitions at runtime.
The web app loads bundled definitions on init, then fetches from the API for custom ones.
