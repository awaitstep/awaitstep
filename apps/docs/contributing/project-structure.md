---
title: Project Structure
---

# Project Structure

AwaitStep is a pnpm monorepo. Top-level directories:

```
awaitstep/
├── apps/
│   ├── api/          ← Hono API server (Cloudflare Worker or Node.js)
│   ├── web/          ← React SPA (Vite + React Router)
│   └── docs/         ← VitePress documentation site
├── packages/
│   ├── ir/           ← Workflow IR types, schema, validation, expression parser
│   ├── codegen/      ← Code generator interface and utilities
│   ├── provider-cloudflare/ ← Cloudflare Workflows code generator + deploy logic
│   ├── db/           ← Drizzle ORM schema and migrations
│   ├── email/        ← Email sending (magic link, notifications)
│   └── node-cli/     ← CLI tool for creating and validating custom nodes
├── nodes/            ← Built-in and community node definitions
├── tooling/
│   ├── tsconfig/     ← Shared TypeScript configs
│   └── eslint/       ← Shared ESLint configs
└── plan/             ← Implementation plans and architecture docs
```

## apps/api

The API server is built with [Hono](https://hono.dev) and runs on both Cloudflare Workers and Node.js. Entry points:

| File              | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `src/index.ts`    | App factory — creates the Hono app, registers all routes                 |
| `src/serve.ts`    | Node.js entry — reads env vars, creates DB connection, starts the server |
| `src/worker.ts`   | Cloudflare Worker entry                                                  |
| `src/routes/`     | Route handlers (one file per resource group)                             |
| `src/middleware/` | Auth, rate limiting, error handling                                      |

Route files are thin — they call methods on service objects and return responses. Business logic lives in `src/services/`.

## apps/web

The React SPA. Key directories:

| Path              | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| `src/routes/`     | React Router v7 file-based routes                               |
| `src/components/` | Domain-specific components (canvas, config drawers, run detail) |
| `src/stores/`     | Zustand stores                                                  |
| `src/lib/`        | Utilities, API clients, type helpers                            |

## packages/ir

The IR package defines the Workflow IR types and all logic that operates on them:

| File                     | Purpose                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `src/types.ts`           | `WorkflowIR`, `WorkflowNode`, `Edge`, `TriggerConfig` types                               |
| `src/schema.ts`          | Zod validation schema                                                                     |
| `src/validate.ts`        | Semantic validation (cycle detection, expression checks)                                  |
| `src/expressions.ts`     | Expression parser and resolver (`<span v-pre>&#123;&#123;nodeId.path&#125;&#125;</span>`) |
| `src/node-definition.ts` | `NodeDefinition`, `ConfigField`, `OutputField` types                                      |
| `src/bundled-nodes/`     | Built-in node definitions (http_request, etc.)                                            |

## packages/codegen

Defines the `CodeGenerator` interface and shared utilities (variable naming, indentation, sanitisation). Provider packages implement this interface.

## packages/provider-cloudflare

Generates TypeScript from a `WorkflowIR` for the Cloudflare Workflows runtime:

| Path                      | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `src/codegen/generate.ts` | Top-level code generator entry point                      |
| `src/codegen/generators/` | One file per node type                                    |
| `src/codegen/bindings.ts` | Auto-detects Cloudflare resource bindings                 |
| `src/api.ts`              | Cloudflare REST API client (deploy, trigger, run control) |

## packages/db

Drizzle ORM schema and migrations. Never import the DB client directly in app code — it is injected via the app factory.

## nodes/

Each subdirectory is a node definition:

```
nodes/
├── stripe_charge/
│   ├── node.json
│   ├── README.md
│   ├── templates/
│   │   └── cloudflare.ts
│   └── tests/
│       └── cloudflare.test.ts
└── resend_send_email/
    └── ...
```

See [Adding Nodes](./adding-nodes.md) for how to create a new node.

## Dependency rules

Packages must not have circular dependencies. The allowed dependency flow is:

```
ir → codegen → provider-cloudflare
db  (standalone)
email (standalone)
```

App code (`apps/api`, `apps/web`) may import from any package. Packages must not import from apps.
