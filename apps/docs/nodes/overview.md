# Nodes Overview

A node is a reusable, self-describing workflow building block. Every node on the canvas maps to a node definition that specifies:

- **What it does** — a name, description, and category
- **What it needs** — a config schema that drives the UI form automatically
- **What it produces** — a typed output schema that downstream nodes can reference via <code v-pre>{{nodeId.property}}</code>
- **How it runs** — one or more code templates, one per execution provider

The workflow generator wraps a top-level node in `flow.step(...)`. You never write retry or durability logic — the platform handles it.

## Two Kinds of Nodes

### Built-in Nodes

Built-in nodes are bundled with AwaitStep. They cannot be removed or overridden. There are 13 of them:

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
| `sub_script`     | Control Flow | Call another function/script               |

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
  id: string // e.g. "stripe"
  name: string // e.g. "Stripe"
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

A registry node has one template per version (`registry/nodes/<id>/<version>/template.ts`) and may override it per provider (`<version>/templates/<provider>.ts`). A local node uses `nodes/<id>/template.ts` or `nodes/<id>/templates/<provider>.ts`. A template is a plain TypeScript module that exports a default async function:

```typescript
export default async function (ctx) {
  // ctx.config — resolved config values
  // ctx.env    — environment variables and secrets
  return { result: ctx.config.input }
}
```

There is no `@awaitstep/node-sdk` package and no `NodeContext` type. The generator rewrites `ctx.config` reads into the step's params and `ctx.env` reads into the generated `env` object, then emits the template as a module and a `flow.step(...)` call.

### Template Rules

- Use Web APIs (`fetch`, `crypto`, `URL`). Cloudflare templates must not use `fs`, `path`, `process`, or `Buffer`.
- Never call durable primitives (`step.do`, `step.sleep`, `step.waitForEvent`) inside a template — the platform wraps your code.
- Always throw on errors. Never return `{ success: false }`.
- Access secrets via `ctx.env.VAR_NAME`, never via `ctx.config`.
- Never log secret values.

## Categories

| Category        | Example nodes                                                       |
| --------------- | ------------------------------------------------------------------- |
| `Control Flow`  | branch, loop, parallel, try_catch                                   |
| `HTTP`          | http_request                                                        |
| `Scheduling`    | sleep, wait_for_event                                               |
| `Payments`      | stripe, paddle, paypal, lemon-squeezy                               |
| `Email`         | resend, sendgrid, mailchimp, convertkit                             |
| `Messaging`     | slack, discord, telegram, twilio                                    |
| `Database`      | airtable, supabase, firebase-firestore, upstash-redis               |
| `Storage`       | s3                                                                  |
| `AI`            | openai, anthropic, google-gemini, elevenlabs, perplexity, replicate |
| `Notifications` | pagerduty, sentry                                                   |
| `Data`          | notion, google-sheets, hubspot                                      |
| `Utilities`     | github, jira, linear, monday, trello                                |
