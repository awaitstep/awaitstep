# Nodes Overview

A node is a reusable, self-describing workflow building block. Every node on the canvas maps to a node definition that specifies:

- **What it does** — a name, description, and category
- **What it needs** — a config schema that drives the UI form automatically
- **What it produces** — a typed output schema that downstream nodes can reference via <code v-pre>{{nodeId.property}}</code>
- **How it runs** — one or more code templates, one per execution provider

Every node is automatically wrapped in `step.do()` by the compile pipeline. You never write retry or durability logic — the platform handles it.

## Two Kinds of Nodes

### Built-in Nodes

Built-in nodes are bundled with AwaitStep. They cannot be removed or overridden. There are 12 of them:

| Node             | Category     | Description                                |
| ---------------- | ------------ | ------------------------------------------ |
| `step`           | Control Flow | Run arbitrary TypeScript in a durable step |
| `branch`         | Control Flow | Conditional routing with multiple paths    |
| `parallel`       | Control Flow | Run multiple branches concurrently         |
| `loop`           | Control Flow | Repeat steps with forEach, while, or count |
| `break`          | Control Flow | Exit a loop or stop workflow execution     |
| `race`           | Control Flow | First branch to complete wins              |
| `try_catch`      | Control Flow | Wrap steps in try/catch/finally            |
| `sleep`          | Scheduling   | Pause for a duration                       |
| `sleep_until`    | Scheduling   | Pause until a timestamp                    |
| `wait_for_event` | Scheduling   | Pause until an external event arrives      |
| `http_request`   | HTTP         | Make an HTTP API call                      |
| `sub_workflow`   | Control Flow | Trigger another workflow                   |

See [Built-in Nodes](./built-in.md) for the full reference.

### Custom Nodes

Custom nodes extend AwaitStep with integrations you write or install from the marketplace. They follow the same `NodeDefinition` schema as built-in nodes and are indistinguishable from built-ins once installed.

There are two sources for custom nodes:

- **Local nodes** — authored in your repository under `nodes/<node_id>/`
- **Remote nodes** — installed from the AwaitStep marketplace or a custom registry

See [Custom Nodes](./custom-nodes.md) and [Marketplace](./marketplace.md) for details.

## The NodeDefinition Model

Every node — built-in or custom — is described by a `NodeDefinition` object.

```typescript
interface NodeDefinition {
  // Identity
  id: string // e.g. "stripe_charge"
  name: string // e.g. "Stripe Charge"
  version: string // Semver, e.g. "1.0.0"
  description: string // Max 120 chars
  category: Category
  tags?: string[]
  icon?: string // HTTPS URL to SVG icon
  docsUrl?: string
  author: string // GitHub username or org
  license: string // SPDX identifier

  // Schema
  configSchema: Record<string, ConfigField>
  outputSchema: Record<string, OutputField>

  // Providers
  providers: Provider[] // Which platforms have templates

  // Optional
  dependencies?: Record<string, string> // npm deps required at runtime
  runtime?: {
    defaultTimeout?: string
    defaultRetries?: number
    idempotent?: boolean
  }
  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}
```

## How Templates Work

Each node has one or more template files in its `templates/` directory, named by provider (`cloudflare.ts`, `inngest.ts`, etc.). A template is a TypeScript module that exports a default async function:

```typescript
import type { NodeContext } from '@awaitstep/node-sdk'

export default async function (ctx: NodeContext<Config>): Promise<Output> {
  // Business logic here
  // ctx.config — user-provided config values
  // ctx.env    — environment variables and secrets
  // ctx.inputs — outputs from upstream steps
  throw new Error('...') // Always throw on error — never swallow
}
```

At deploy time, the codegen pipeline resolves the correct template for the target provider and inlines the template body into a `step.do()` call in the generated worker.

### NodeContext

```typescript
interface NodeContext<TConfig = Record<string, unknown>> {
  config: TConfig // Config values from the drawer
  env: Record<string, string> // Env vars and secrets (ctx.env.MY_SECRET)
  inputs: Record<string, unknown> // Outputs from upstream steps
  workflow: {
    id: string // Workflow definition ID
    instanceId: string // This run's instance ID
    triggeredAt: string // ISO timestamp
  }
}
```

### Template Rules

- Use Web APIs only for Cloudflare templates (`fetch`, `crypto`, `URL`). No `fs`, `path`, `process`, or `Buffer`.
- Never call `step.do()`, `step.sleep()`, or `step.sleepUntil()` inside a template — the platform wraps your code.
- Always throw on errors. Never return `{ success: false }`.
- Access secrets via `ctx.env.VAR_NAME`, never via `ctx.config`.
- Never log secret values.

## Categories

| Category        | Example nodes                     |
| --------------- | --------------------------------- |
| `Control Flow`  | branch, loop, parallel, try_catch |
| `HTTP`          | http_request                      |
| `Scheduling`    | sleep, wait_for_event             |
| `Payments`      | stripe_charge, stripe_refund      |
| `Email`         | resend_send_email, sendgrid_send  |
| `Messaging`     | slack_post_message, twilio_sms    |
| `Database`      | postgres_query, d1_query          |
| `Storage`       | r2_put, s3_upload                 |
| `AI`            | openai_chat, anthropic_message    |
| `Notifications` | pagerduty_alert                   |
| `Data`          | json_transform, csv_parse         |
| `Utilities`     | generate_uuid, format_date        |
