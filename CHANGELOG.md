# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **IR**: TriggerConfig type (http, cron, event, manual) as optional field on WorkflowIR
- **IR**: `nodeId` field on ValidationError for mapping errors to canvas nodes
- **Codegen**: `verifyCredentials()` method on WorkflowProvider interface
- **Codegen**: `destroy()` method on WorkflowProvider interface
- **Provider-Cloudflare**: Token verification via `CloudflareAPI.verifyToken()`
- **Provider-Cloudflare**: `destroy()` implementation delegating to wrangler
- **DB**: `TokenCrypto` interface for runtime-agnostic token encryption
- **DB**: AES-256-GCM encryption for API tokens at rest (Web Crypto API)
- **DB**: `deleteDeploymentsByWorkflow()` for cleanup on takedown
- **API**: Pre-deploy validation — IR validation + credential check before deploy
- **API**: `TOKEN_ENCRYPTION_KEY` required environment variable
- **Web**: IR JSON toggle on code preview panel
- **Web**: Copy-to-clipboard on code preview
- **Web**: Trigger dialog with JSON payload editor and real-time validation
- **Web**: Quick-copy curl command on deploy success and trigger dialog
- **Web**: Step status visualization on canvas during runs (complete/running/errored/pending)
- **Web**: Read-only canvas preview on run detail page
- **Web**: Run overlay store for per-node step status
- **Web**: Enhanced error display with name/message/stack and collapsible raw JSON
- **Web**: Workflow status badges on dashboard (draft/deployed/error)
- **Web**: `triggerWorkflow()` in API client
- Architecture diagram in `docs/architecture.md`

### Changed

- License changed from MIT to Apache License 2.0
- CONTRIBUTING.md updated with env setup instructions
- PR template simplified with package checkboxes
- Takedown route now cleans up deployment records from database
- Deploy routes use `adapter.validate()` and `adapter.verifyCredentials()` instead of inline checks

### Fixed

- Deployment records are now deleted when a workflow is taken down

## [0.0.1] - 2026-03-16

### Added

- Initial monorepo scaffold with pnpm workspaces and Turborepo
- `@awaitstep/ir`: WorkflowIR types, Zod schemas, validation, serialization, expression system
- `@awaitstep/codegen`: DAG traversal, code generation framework, provider interface, esbuild transpilation
- `@awaitstep/provider-cloudflare`: Cloudflare Workflows adapter, wrangler deploy, resource browsers (KV, D1, R2)
- `@awaitstep/db`: Drizzle ORM schema for SQLite and PostgreSQL, database adapter
- `@awaitstep/api`: Hono API server with auth (GitHub, Google, Magic Links), workflow CRUD, deploy streaming (SSE), run management, resource browsing
- `@awaitstep/web`: TanStack Start frontend with ReactFlow canvas, node palette, drag-drop, edge proximity insertion, Monaco code editor, node config panel, validation panel, code preview, deploy dialog, run monitoring, workflow templates (20+), path simulation engine
- CI pipeline with GitHub Actions (type-check, lint, test)
- Authentication via better-auth (GitHub, Google OAuth, Magic Links)
- Self-hosted connection support (env var based)
- Local auto-save persistence (localStorage)
