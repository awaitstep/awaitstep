# AwaitStep

![AwaitStep — Build and deploy workflows visually](docs/images/banner.png)

A self-hosted visual builder that generates and deploys code directly to [Cloudflare Workflows](https://developers.cloudflare.com/workflows/). No proprietary engines, just your code.

## Features

### Visual Canvas

Drag-and-drop workflow designer. Add steps, branches, loops, parallel paths, error handling, and more — all from a visual canvas. See your workflow structure at a glance.

![Visual Canvas](docs/images/canvas.png)

### Live Code Preview

Watch TypeScript code generate in real-time as you build. Every change on the canvas immediately reflects in the code preview. Toggle between generated TypeScript, IR JSON, and package output.

![Live Code Preview](docs/images/code-preview.png)

### Deploy, Version, and Monitor

Deploy directly to your provider from the UI. AwaitStep handles code generation, bundling, dependency installation, and deployment. Track version history, lock versions, and roll back. Trigger workflows and monitor runs in real-time — view status, output, errors, and duration. Pause, resume, or terminate running instances.

![Deploy and Monitor](docs/images/deploy-and-monitor.png)

### Workflow Nodes

Build complex workflows from composable building blocks:

| Node           | Description                                  |
| -------------- | -------------------------------------------- |
| Step           | Execute custom code with retries and backoff |
| Sleep          | Pause for a duration (up to 365 days)        |
| Sleep Until    | Pause until a specific timestamp             |
| Branch         | Conditional execution paths                  |
| Parallel       | Run steps concurrently                       |
| Loop           | Repeat steps (forEach, while, or count)      |
| Try / Catch    | Error handling with try/catch/finally        |
| Exit           | Break from a loop or return from workflow    |
| HTTP Request   | Make HTTP calls with configurable retries    |
| Wait for Event | Pause until an external event arrives        |
| Sub-Workflow   | Trigger another workflow                     |
| Custom         | User-defined node types                      |

### Custom Nodes and Marketplace

Build your own node types with the CLI. Define a config schema, UI, and provider-specific code generation template — then publish to the marketplace for others to install. See the [custom nodes guide](docs/custom-nodes.md).

### Environment Variables and Secrets

Manage global and per-workflow environment variables from the dashboard. Variables prefixed with `SECRET_` are encrypted at rest with AES-256-GCM.

### REST API and API Keys

Full REST API for programmatic access. Generate scoped API keys (read / write / deploy) with optional expiration. Interactive API playground built into the dashboard. See the [API reference](docs/api-reference.md).

### Resource Browser

Browse your Cloudflare resources directly from the dashboard — KV namespaces with key inspection, D1 databases with SQL queries, and R2 buckets with object browsing.

### Local Development

Test workflows locally before deploying. Real-time log streaming, local triggers, and instant feedback — no deploy round-trips needed.

### Self-Hostable

Run anywhere: Docker, VPS, or your own infrastructure. SQLite by default, PostgreSQL for production. Single Docker image with built-in migrations.

## Quickstart

**Prerequisites:** Node.js >= 20, pnpm >= 9

```bash
git clone https://github.com/awaitstep/awaitstep.git
cd awaitstep
cp .env.example .env
```

Generate the required secrets and update `.env`:

```bash
# Generate TOKEN_ENCRYPTION_KEY and BETTER_AUTH_SECRET
openssl rand -hex 32  # run twice, one for each key
```

Then build and start:

```bash
pnpm install
pnpm build
pnpm dev
```

## Documentation

- [Architecture](docs/architecture.md) — System design, data flow, and package structure
- [API Reference](docs/api-reference.md) — All endpoints and database schema
- [Compilation Pipeline](docs/compilation.md) — How canvas IR becomes deployed code
- [Custom Nodes](docs/custom-nodes.md) — Build and publish your own node types

**Built with** TypeScript · React · Hono · Cloudflare Workers

## Security

To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## AI Usage

This project uses AI tools during development. See [AI_USE.md](AI_USE.md) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.
