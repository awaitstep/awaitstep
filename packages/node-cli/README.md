# @awaitstep/node-cli

CLI tool for validating and bundling custom AwaitStep workflow nodes.

## Overview

Custom nodes let you extend AwaitStep with your own workflow building blocks. Each node defines what it needs (config schema), what it produces (output schema), and how it runs (provider templates). The `node-cli` validates all of this and produces a single `nodes.local.json` file that the platform consumes at build time.

## Quick Start

```bash
# 1. Create a node directory
mkdir -p nodes/my_node

# 2. Write the node definition
cat > nodes/my_node/node.json << 'EOF'
{
  "id": "my_node",
  "name": "My Node",
  "version": "1.0.0",
  "description": "Does something useful",
  "category": "Utilities",
  "author": "your-name",
  "license": "MIT",
  "configSchema": {
    "url": { "type": "string", "label": "URL", "required": true }
  },
  "outputSchema": {
    "result": { "type": "object" }
  },
  "providers": ["cloudflare"]
}
EOF

# 3. Write the template
cat > nodes/my_node/template.ts << 'EOF'
export default async function(ctx) {
  const response = await fetch(ctx.config.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
EOF

# 4. Generate the bundle
pnpm nodes:generate
```

This produces `nodes/nodes.local.json` — commit this file to your repo.

## Usage

### `pnpm nodes:generate`

Validates all custom nodes in `nodes/` and produces a single `nodes/nodes.local.json` bundle file.

What it does:

1. Scans `nodes/` for subdirectories (each subdirectory is a node)
2. For each node:
   - Reads and validates `node.json` against the `NodeDefinition` schema
   - Checks the `id` matches the directory name
   - Checks the `id` doesn't conflict with built-in nodes
   - Validates that `secret` fields have `envVarName`
   - Validates that `select`/`multiselect` fields have `options`
   - Reads template files for each declared provider
   - Computes a SHA-256 checksum
3. Writes all validated bundles to `nodes/nodes.local.json`

If any node fails validation, the command exits with an error and no output file is written.

### Direct invocation

```bash
# Default: scans ./nodes
node packages/node-cli/dist/cli.js generate

# Custom directory
node packages/node-cli/dist/cli.js generate ./path/to/nodes
```

## Node Directory Structure

Every custom node lives in its own directory under `nodes/`. The directory name **must** match the node's `id`.

```
nodes/
├── .gitkeep
├── nodes.local.json              ← Generated output (commit this)
├── stripe_charge/
│   ├── node.json                 ← Node definition (required)
│   └── template.ts              ← Shared template (used for all providers)
└── slack_message/
    ├── node.json
    └── templates/
        ├── cloudflare.ts         ← Provider-specific (when code differs)
        └── inngest.ts
```

### Template Resolution

Templates are resolved per provider in this order:

1. `templates/<provider>.ts` — provider-specific template
2. `template.ts` — shared template (used for all providers that don't have a specific one)

Most nodes only need a shared `template.ts` since the code is the same across providers (pure `fetch` calls, data transforms, etc.). Use provider-specific templates only when the code genuinely differs (e.g. Step Functions uses JSON ASL, or a node needs Node.js APIs on Inngest but Web APIs on Cloudflare).

## Node Definition (`node.json`)

```json
{
  "id": "stripe_charge",
  "name": "Stripe Charge",
  "version": "1.0.0",
  "description": "Creates a Stripe charge",
  "category": "Payments",
  "author": "your-name",
  "license": "MIT",
  "configSchema": { ... },
  "outputSchema": { ... },
  "providers": ["cloudflare"]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier. Must match `^[a-z][a-z0-9_-]*$`. Must match directory name. |
| `name` | `string` | Human-readable name shown in the UI. |
| `version` | `string` | Semver version string. |
| `description` | `string` | One sentence, max 120 characters. |
| `category` | `Category` | One of: `Payments`, `Email`, `Messaging`, `Database`, `Storage`, `AI`, `Authentication`, `HTTP`, `Scheduling`, `Notifications`, `Data`, `Utilities`, `Control Flow`, `Internal` |
| `author` | `string` | Author name or GitHub username. |
| `license` | `string` | SPDX license identifier (e.g. `MIT`, `Apache-2.0`). |
| `configSchema` | `Record<string, ConfigField>` | Defines the node's configuration UI. |
| `outputSchema` | `Record<string, OutputField>` | Defines what the node returns. |
| `providers` | `Provider[]` | Which providers have templates. At least one required. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `tags` | `string[]` | Search keywords. |
| `icon` | `string` | Icon identifier. |
| `docsUrl` | `string` | URL to external documentation. |
| `runtime.defaultTimeout` | `string` | Default timeout (e.g. `"30 seconds"`). |
| `runtime.defaultRetries` | `number` | Default retry count. |
| `runtime.idempotent` | `boolean` | Whether the node is safe to retry. |
| `deprecated` | `boolean` | Mark as deprecated. |
| `deprecationMessage` | `string` | Message shown when deprecated. |
| `replacedBy` | `string` | ID of the replacement node. |

### Reserved IDs

These IDs are reserved for built-in nodes and cannot be used:

`step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`

## Config Schema

The `configSchema` defines what the user configures in the UI. Each field has a type that maps to a UI control.

### Field Types

| Type | UI Control | Extra Requirements |
|------|-----------|-------------------|
| `string` | Text input | — |
| `number` | Number input | — |
| `boolean` | Toggle | — |
| `select` | Dropdown | **`options` required** |
| `multiselect` | Multi-select | **`options` required** |
| `secret` | Masked input | **`envVarName` required** |
| `code` | Code editor | — |
| `json` | JSON editor | — |
| `expression` | Expression input | — |
| `textarea` | Multi-line text | — |

### Example

```json
{
  "amount": {
    "type": "number",
    "label": "Amount (cents)",
    "required": true,
    "validation": { "min": 50 }
  },
  "currency": {
    "type": "select",
    "label": "Currency",
    "options": ["usd", "eur", "gbp"],
    "default": "usd"
  },
  "apiKey": {
    "type": "secret",
    "label": "API Key",
    "required": true,
    "envVarName": "STRIPE_API_KEY"
  }
}
```

## Output Schema

The `outputSchema` defines what the node returns. Downstream nodes can reference these fields via expressions.

```json
{
  "chargeId": { "type": "string", "description": "Stripe charge ID" },
  "amount": { "type": "number" },
  "metadata": {
    "type": "object",
    "properties": {
      "receiptUrl": { "type": "string" }
    }
  }
}
```

Supported types: `string`, `number`, `boolean`, `object`, `array`, `null`

## Templates

Templates live in `templates/<provider>.ts`. Each template exports a default async function that receives a `ctx` parameter.

### Template Rules

1. **Export a default async function** — this is what the platform compiles
2. **Return an object matching `outputSchema`** — the return value is the node's output
3. **Throw on errors** — never swallow errors; the platform needs them for retry logic
4. **Use `ctx.config.*` for user config** — values from the config drawer
5. **Use `ctx.env.*` for secrets** — environment variables, never in `ctx.config`
6. **Use `ctx.inputs.*` for upstream data** — outputs from previous steps
7. **No durable primitives** — never call `step.do()`, `step.sleep()`, etc.
8. **Web APIs only for Cloudflare** — no `fs`, `path`, `process`, `Buffer`

### Example

```typescript
export default async function(ctx) {
  const response = await fetch("https://api.stripe.com/v1/charges", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ctx.env.STRIPE_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      amount: String(ctx.config.amount),
      currency: ctx.config.currency,
      source: ctx.inputs.payment_token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stripe API error: ${response.status}`);
  }

  const charge = await response.json();
  return {
    chargeId: charge.id,
    amount: charge.amount,
    metadata: { receiptUrl: charge.receipt_url },
  };
}
```

### How Templates Are Compiled

At deploy time, the codegen pipeline transforms your template into a `step.do()` call:

- `ctx.config.amount` → replaced with the literal value from the node's config (e.g. `5000`)
- `ctx.env.STRIPE_API_KEY` → replaced with `env.STRIPE_API_KEY`
- `ctx.inputs.payment_token` → replaced with the variable reference to the upstream step's output

Users can also type `{{env.NAME}}` directly in any string config field on the canvas.
This emits a bare `env.NAME` reference in generated code (not a string literal), and
the env var name is automatically added to the generated `interface Env`.

Your template function body is extracted and wrapped in:

```typescript
const Stripe_Charge = await step.do("Stripe Charge", { retries: ... }, async () => {
  // your template body here, with ctx.* references resolved
});
```

## Generated Output

`nodes/nodes.local.json` contains an array of `NodeBundle` objects:

```json
[
  {
    "definition": { /* full NodeDefinition */ },
    "templates": {
      "cloudflare": "export default async function(ctx) { ... }"
    },
    "bundledAt": "2026-03-19T12:00:00.000Z",
    "checksum": "sha256:abc123..."
  }
]
```

This file should be committed to your repository. It only needs to be regenerated when you change a node's `node.json` or template files.

## Validation Errors

The CLI provides clear error messages for common issues:

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing node.json` | No `node.json` in node directory | Create the file |
| `node.json is not valid JSON` | Syntax error in JSON | Fix the JSON syntax |
| `Validation failed: ...` | Schema validation error | Check field types, required fields |
| `id "X" does not match directory name "Y"` | Mismatch between `id` and directory | Rename directory or fix `id` |
| `"X" conflicts with a builtin node type` | Using a reserved ID | Choose a different ID |
| `secret field must have envVarName` | Secret field without `envVarName` | Add `envVarName` to the field |
| `select field must have non-empty options` | Select/multiselect without options | Add `options` array |
| `Missing template: templates/X.ts` | Provider declared but no template file | Create the template file |

## Development Workflow

```bash
# 1. Create or modify nodes in nodes/
vim nodes/my_node/node.json
vim nodes/my_node/templates/cloudflare.ts

# 2. Validate and bundle
pnpm nodes:generate

# 3. Commit the bundle
git add nodes/
git commit -m "feat: add my_node custom node"

# 4. Build and deploy — the app picks up nodes.local.json at build time
pnpm build
```
