# AwaitStep Node Authoring Guide

The complete reference for creating custom nodes.

## What is a node?

A node is a reusable workflow building block that defines:

- **What it does** — name, description, category
- **What it needs** — a config schema that drives the UI
- **What it produces** — an output schema downstream steps can reference
- **How it runs** — a TypeScript template

The workflow generator wraps a top-level node in `flow.step(...)`; a node inside
a loop or branch stays inline in that block. The platform owns retries, timeouts,
and durability. You write the business logic.

## Two kinds of custom nodes

- **Registry node** — shared, versioned, published from `registry/nodes/`.
- **Local node** — private to this app, under `nodes/`, bundled at build time.

## Registry node layout

```
registry/nodes/<node_id>/
├── icon.svg
├── base.json                 # NodeDefinition without version/description
└── <version>/
    ├── overrides.json        # version, description, changed fields
    └── template.ts           # or templates/<provider>.ts
```

The canonical example is `registry/nodes/google-gemini/`.

`base.json` holds every shared field. Each version adds only what changes.
Do not create `<version>/node.json`; CI regenerates it on `main`.

## Local node layout

```
nodes/<node_id>/
├── node.json                 # full NodeDefinition (includes version)
├── template.ts               # or templates/<provider>.ts
├── icon.svg
└── README.md
```

`pnpm nodes:generate` validates local nodes and writes
`nodes/nodes.local.json`; `pnpm nodes:build` merges them into
`nodes/registry.json`.

## NodeDefinition

```typescript
interface NodeDefinition {
  id: string
  name: string
  version: string
  description: string // max 120 chars
  category: Category
  tags?: string[]
  icon?: string
  docsUrl?: string
  author: string
  license: string
  configSchema: Record<string, ConfigField>
  outputSchema: Record<string, OutputField>
  providers: string[] // platforms with a template
  dependencies?: Record<string, string>
  runtime?: {
    defaultTimeout?: string
    defaultRetries?: number
    idempotent?: boolean
    streaming?: boolean
  }
  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}
```

## Config fields

| Type          | UI control        | Extra                         |
| ------------- | ----------------- | ----------------------------- |
| `string`      | Text input        | —                             |
| `textarea`    | Multi-line text   | —                             |
| `number`      | Numeric input     | optional `validation.min/max` |
| `boolean`     | Toggle            | optional `default`            |
| `select`      | Dropdown          | required non-empty `options`  |
| `multiselect` | Multi-select      | required non-empty `options`  |
| `secret`      | Masked input      | required `envVarName`         |
| `code`        | Monaco TypeScript | —                             |
| `json`        | Monaco JSON       | —                             |
| `expression`  | Expression picker | —                             |

Example multi-action schema:

```json
{
  "action": {
    "type": "select",
    "label": "Action",
    "required": true,
    "options": ["Send Message", "List Channels"]
  },
  "channel": {
    "type": "string",
    "label": "Channel",
    "description": "Channel ID. Used by: Send Message."
  },
  "text": {
    "type": "textarea",
    "label": "Text",
    "description": "Message text. Used by: Send Message."
  },
  "token": {
    "type": "secret",
    "label": "Bot Token",
    "required": true,
    "envVarName": "SLACK_BOT_TOKEN"
  }
}
```

## Output fields

```typescript
type OutputField = {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string
  nullable?: boolean
  items?: OutputField
  properties?: Record<string, OutputField>
}
```

- `object`/`array` are free-form without `properties`/`items`.
- Use `nullable: true` when an action can return `null` or omit the field.
- List actions should return the provider's full response object under `data`,
  not a bare array.

## Template contract

A template exports one default async function:

```typescript
export default async function (ctx) {
  const action = ctx.config.action
  const token = ctx.env.SLACK_BOT_TOKEN

  switch (action) {
    case 'Send Message': {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel: ctx.config.channel, text: ctx.config.text }),
      })
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok || data.ok === false) {
        throw new Error(`Slack API error: ${data.error ?? response.statusText}`)
      }
      return { ok: true, ts: data.ts, channel: data.channel, data }
    }
    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
```

Rules:

1. Export a default async function; no named exports.
2. Throw on errors; never return `{ success: false }`.
3. Use Web APIs (`fetch`, `crypto`, `URL`). Cloudflare templates must not use
   `fs`, `path`, `process`, or `Buffer`.
4. Never call `step.do`, `step.sleep`, `step.waitForEvent`.
5. Access secrets via `ctx.env`, never `ctx.config`.
6. Never log secrets.
7. Import only packages declared in `dependencies`.

## What codegen does

For a top-level workflow node, the generator:

1. resolves the version's template (provider-specific first, then `template.ts`);
2. extracts the default function body;
3. rewrites `ctx.config` to the step's params and `ctx.env` to `env`;
4. emits a generated module `nodes/<varName>.ts`;
5. calls it from `flow.step(...)`.

A node inside a loop/branch stays inline in that block. Scripts generate modules
too. Edit the template, not the generated module.

## Dependencies

Declare runtime packages in the definition:

```json
"dependencies": { "@supabase/supabase-js": "^2" }
```

They are installed during deploy and bundled with the generated project. A
template may import only declared packages.

## Config expressions

A config value such as `{{fetch_user.id}}` is resolved before generation into a
step param. The template reads it as `ctx.config.<field>`; it does not need a
separate inputs object.

## Validation

Registry node:

```bash
pnpm --filter @awaitstep/registry validate
```

It checks base/overrides merge, semver order, the definition schema, action
options against `case` labels, config/env references, template parsing, imports,
forbidden APIs, and output schema shapes. Run the tests when ready:

```bash
pnpm --filter @awaitstep/registry test
```

Local node:

```bash
pnpm nodes:generate
```

Never run `registry/scripts/build-index.ts` locally and never commit
`<version>/node.json` or `registry/index.json`.

## Versioning

Add a new version directory instead of editing a published one:

```
registry/nodes/slack/
├── base.json
├── 1.0.0/...
└── 1.1.0/
    ├── overrides.json   # { version, description, changed fields }
    └── template.ts
```

Use semver: patch for an internal fix, minor for additive fields/actions, major
for a required-field or output-shape change. Arrays replace the base array.

## Authoring checklist

- [ ] ID matches the directory and is not a builtin.
- [ ] `base.json` has no `version` or `description`.
- [ ] Each version has `overrides.json` and a template.
- [ ] Every action option has a `case` and vice versa.
- [ ] Every secret field has `envVarName`; the template reads it via `ctx.env`.
- [ ] Every `ctx.config` key exists in the schema.
- [ ] Errors throw; secrets are never logged.
- [ ] `providers` names only platforms with a template.
- [ ] `docsUrl` points at the provider's docs.
- [ ] The registry validator passes.
