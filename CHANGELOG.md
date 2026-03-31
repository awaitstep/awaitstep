# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0-beta.1] - 2026-03-31

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
- **IR**: `NodeRegistry` class for managing node definitions at runtime
- **IR**: Bundled node definitions for all builtin types
- **Node-CLI**: `@awaitstep/node-cli` package for authoring custom node definitions with validation, template compilation, and registry bundling
- **DB**: `env_vars` table for global encrypted environment variables (unique per user+name)
- **DB**: `workflows.envVars` JSON column for workflow-level env vars
- **DB**: `resolveEnvVars()` resolves `{{global.env.NAME}}` references at query time
- **DB**: `api_keys` table with scoped authentication (read/write/deploy)
- **API**: `GET/POST/PATCH/DELETE /env-vars` routes for global env var management
- **API**: Deploy-time env var resolution and validation — blocks deploy on missing/unresolved vars
- **API**: `GET /nodes`, `GET /nodes/:id`, `GET /nodes/templates` — node registry endpoints
- **API**: `GET/POST/DELETE /api-keys` — scoped API key management (session-only)
- **Codegen**: `envVars` field on `ProviderConfig` for deploy-time injection
- **Codegen**: `{{env.NAME}}` in node config fields emits bare `env.NAME` runtime references
- **Codegen**: Generated `interface Env` auto-includes env var names from node data
- **Provider-Cloudflare**: Wrangler config `vars` for injecting env vars into Workers
- **Web**: Global env vars management page (Resources → Environment Variables) with textarea `.env` editor
- **Web**: Workflow env vars section in settings panel with `{{global.env.NAME}}` link button
- **Web**: Missing node detection — amber warning dot on canvas, destructive hint in config panel, validation error blocking deploy
- **Web**: Editable trigger code in workflow settings
- **Web**: Node registry context — loads bundled + custom node definitions from API
- **Web**: Schema-driven config panel for custom nodes via `DynamicFields`
- **Web**: Debounced input handlers on config panel fields
- **Web**: API key management page

### Changed

- License changed from MIT to Apache License 2.0
- CONTRIBUTING.md updated with env setup instructions
- PR template simplified with package checkboxes
- Takedown route now cleans up deployment records from database
- Deploy routes use `adapter.validate()` and `adapter.verifyCredentials()` instead of inline checks
- `WorkflowProvider.generate()` accepts optional `ProviderConfig` parameter for env var injection
- `EnvBinding.type` reduced to `kv`/`d1`/`r2`/`service` — secrets/variables moved to workflow env vars

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
