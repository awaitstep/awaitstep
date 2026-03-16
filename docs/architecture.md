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
   JavaScript + wrangler.toml → wrangler deploy → Cloudflare Worker + Workflow binding

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
