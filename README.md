# AwaitStep

Visual workflow builder for Cloudflare Workflows. Design workflows with drag-and-drop, generate TypeScript `WorkflowEntrypoint` code, and deploy to your Cloudflare account.

## Features

- **Visual Canvas** — Drag-and-drop workflow designer powered by ReactFlow
- **Live Code Preview** — See generated TypeScript as you build
- **One-Click Deploy** — Deploy directly to Cloudflare Workers
- **Run Monitoring** — Trigger workflows and watch execution in real-time
- **Custom Nodes** — Extend with custom node types via `node-cli`
- **Environment Variables** — Global secrets and per-workflow env vars with encrypted storage
- **API Keys** — Scoped API key authentication (read/write/deploy)
- **Self-Hostable** — Run anywhere: Cloudflare Workers, Docker, VPS, Vercel

## Quickstart

```bash
git clone https://github.com/awaitstep/awaitstep.dev.git
cd awaitstep.dev
pnpm install
pnpm build
pnpm dev
```

**Prerequisites:** Node.js >= 20, pnpm >= 9

## Project Structure

```
awaitstep.dev/
├── packages/
│   ├── ir/                    # WorkflowIR types, schemas, validation, node registry
│   ├── codegen/               # IR → TypeScript code generator + provider interface
│   ├── provider-cloudflare/   # Cloudflare Workflows deploy adapter
│   ├── db/                    # DatabaseAdapter + Drizzle implementations
│   └── node-cli/              # Custom node definition CLI + codegen
├── apps/
│   ├── web/                   # TanStack Start frontend
│   └── api/                   # Hono API server
├── nodes/                     # Custom node definitions (e.g. resend_send_email)
├── docs/                      # Architecture documentation
└── tooling/
    └── tsconfig/              # Shared TypeScript configs
```

## Supported Node Types

| Node | Description | CF Workflows API |
|---|---|---|
| Step | Execute custom code | `step.do()` |
| Sleep | Pause for a duration | `step.sleep()` |
| Sleep Until | Pause until a timestamp | `step.sleepUntil()` |
| Branch | Conditional branching | `if/else` |
| Parallel | Run steps concurrently | `Promise.all()` |
| HTTP Request | Make an HTTP call | `fetch()` inside `step.do()` |
| Wait for Event | Pause until external event | `step.waitForEvent()` |
| Custom | User-defined node types | Template-based `step.do()` |

## Development

```bash
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm type-check   # Type-check all packages
pnpm dev          # Start dev servers
```

## Tech Stack

- **Frontend:** TanStack Start, ReactFlow, Monaco Editor, Zustand, Tailwind CSS
- **Backend:** Hono
- **Auth:** better-auth (GitHub, Google, Magic Links)
- **Database:** SQLite (dev) / PostgreSQL (prod) via Drizzle ORM
- **Codegen:** esbuild
- **Testing:** Vitest + Playwright
- **Monorepo:** pnpm workspaces + Turborepo

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.
