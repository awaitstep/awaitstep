# AwaitStep Node Authoring Guide

The complete reference for creating custom nodes for the AwaitStep platform.

## What is a Node?

A node is a reusable, self-describing workflow building block. It defines:

- **What it does** — a human-readable name, description, and category
- **What it needs** — a config schema that drives the UI automatically
- **What it produces** — a typed output schema that downstream nodes can reference
- **How it runs** — code templates for one or more execution providers

A node does **not** handle retries, timeouts, or state persistence — those are platform concerns. Every node is automatically wrapped in `step.do()` by the compile pipeline. You write the business logic; the platform handles durability.

---

## Directory Structure

Every node lives in its own directory under `nodes/`. The directory name is the node ID.

```
nodes/
└── stripe_charge/
    ├── node.json              ← REQUIRED. NodeDefinition schema.
    ├── README.md              ← REQUIRED. Human-readable docs.
    ├── templates/
    │   ├── cloudflare.ts      ← REQUIRED (at least one template).
    │   ├── inngest.ts         ← OPTIONAL.
    │   ├── temporal.ts        ← OPTIONAL.
    │   └── stepfunctions.json ← OPTIONAL.
    └── tests/
        ├── cloudflare.test.ts ← REQUIRED if cloudflare template exists.
        └── fixtures/
            └── config.json    ← Sample config for tests.
```

### Node ID Rules

- Pattern: `^[a-z][a-z0-9_]*$` — lowercase letters, numbers, underscores only
- Must start with a letter
- Must be descriptive and action-oriented: `stripe_charge`, `resend_send_email`, `slack_post_message`
- Must not conflict with builtin node IDs: `step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`

---

## node.json Reference

The `node.json` file is the complete `NodeDefinition` for your node. All fields marked **required** must be present.

```typescript
interface NodeDefinition {
  // ── Identity ──────────────────────────────────────────────
  id: string // REQUIRED. Matches directory name. e.g. "stripe_charge"
  name: string // REQUIRED. Human-readable. e.g. "Stripe Charge"
  version: string // REQUIRED. Semver. e.g. "1.0.0"
  description: string // REQUIRED. One sentence. Max 120 chars.
  category: Category // REQUIRED. See Category list below.
  tags?: string[] // OPTIONAL. For search. e.g. ["payments", "stripe"]
  icon?: string // OPTIONAL. URL to SVG icon. Must be HTTPS.
  docsUrl?: string // OPTIONAL. Link to external docs.
  author: string // REQUIRED. GitHub username or org. e.g. "awaitstep"
  license: string // REQUIRED. SPDX identifier. e.g. "Apache-2.0"

  // ── Config ────────────────────────────────────────────────
  configSchema: Record<string, ConfigField> // REQUIRED. Drives the config drawer UI.

  // ── Output ────────────────────────────────────────────────
  outputSchema: Record<string, OutputField> // REQUIRED. What this node returns.

  // ── Providers ─────────────────────────────────────────────
  providers: Provider[] // REQUIRED. Which providers have templates.

  // ── Runtime hints ─────────────────────────────────────────
  runtime?: {
    defaultTimeout?: string // e.g. "30 seconds"
    defaultRetries?: number // e.g. 3
    idempotent?: boolean // true = safe to retry without side effects
    streaming?: boolean // true = streams output (future feature)
  }

  // ── Deprecation ───────────────────────────────────────────
  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}
```

### Categories

`Payments` | `Email` | `Messaging` | `Database` | `Storage` | `AI` | `Authentication` | `HTTP` | `Scheduling` | `Notifications` | `Data` | `Utilities` | `Control Flow` | `Internal`

### Providers

`cloudflare` | `inngest` | `temporal` | `stepfunctions`

---

## Config Schema Field Types

The `configSchema` drives the config drawer in the AwaitStep UI. Each field type maps to a UI control that renders automatically.

| Type          | UI Control                      | When to Use                          | Extra Fields                              |
| ------------- | ------------------------------- | ------------------------------------ | ----------------------------------------- |
| `string`      | Single-line text input          | Short text values (names, IDs, URLs) | `validation.format`, `validation.pattern` |
| `number`      | Numeric input                   | Amounts, counts, limits              | `validation.min`, `validation.max`        |
| `boolean`     | Toggle switch                   | On/off flags                         | —                                         |
| `select`      | Dropdown                        | One choice from a fixed list         | **`options[]` required**                  |
| `multiselect` | Multi-select dropdown           | Multiple choices from a fixed list   | **`options[]` required**                  |
| `secret`      | Masked input / env var picker   | API keys, tokens, credentials        | **`envVarName` required**                 |
| `code`        | Monaco editor (TypeScript)      | Custom logic, transform functions    | —                                         |
| `json`        | Monaco editor (JSON)            | Structured data (headers, payloads)  | —                                         |
| `expression`  | JS expression with autocomplete | References to upstream step outputs  | —                                         |
| `textarea`    | Multi-line text                 | Long text (email bodies, templates)  | —                                         |

### ConfigField Interface

```typescript
interface ConfigField {
  type: FieldType
  label: string // Shown as the field label in the drawer
  description?: string // Helper text shown below the field
  required?: boolean // Default: false
  default?: unknown // Default value pre-filled in the UI
  placeholder?: string // Shown when field is empty
  options?: string[] // REQUIRED for select and multiselect
  envVarName?: string // REQUIRED for secret fields. SCREAMING_SNAKE_CASE.
  validation?: FieldValidation
}

interface FieldValidation {
  min?: number // number fields
  max?: number // number fields
  minLength?: number // string fields
  maxLength?: number // string fields
  pattern?: string // regex pattern for string fields
  format?: 'email' | 'url' | 'uuid' | 'date' | 'date-time' | 'duration'
}
```

### Examples

**String with URL validation:**

```json
{
  "type": "string",
  "label": "Webhook URL",
  "required": true,
  "placeholder": "https://example.com/webhook",
  "validation": { "format": "url" }
}
```

**Number with min/max:**

```json
{
  "type": "number",
  "label": "Amount (cents)",
  "required": true,
  "default": 1000,
  "validation": { "min": 50, "max": 9999999 }
}
```

**Select with options:**

```json
{
  "type": "select",
  "label": "Currency",
  "required": true,
  "default": "usd",
  "options": ["usd", "eur", "gbp", "jpy"]
}
```

**Secret:**

```json
{
  "type": "secret",
  "label": "Stripe Secret Key",
  "required": true,
  "envVarName": "STRIPE_SECRET_KEY",
  "description": "Found in your Stripe Dashboard under Developers → API keys"
}
```

---

## Secret Handling

Secrets are never stored in the IR or in AwaitStep's database. They live in the user's deployment environment.

### Rules

1. Every `secret` field **must** declare `envVarName`
2. `envVarName` must be `SCREAMING_SNAKE_CASE` and globally descriptive
3. In templates, access via `ctx.env.SECRET_NAME` — never via `ctx.config`
4. Never log secret values in templates
5. Never include secrets in error messages

### Pattern

```json
// In node.json configSchema:
"apiKey": {
  "type": "secret",
  "label": "API Key",
  "required": true,
  "envVarName": "MY_SERVICE_API_KEY"
}
```

```typescript
// In template:
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${ctx.env.MY_SERVICE_API_KEY}` },
})
```

---

## Output Schema

The `outputSchema` defines what your node returns. It is used by:

- The IR — to type-check connections between nodes
- Expression autocomplete — so users can reference `your_node_result.fieldName`
- The run detail view — to display step outputs

### OutputField Interface

```typescript
interface OutputField {
  type: OutputFieldType // 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  description?: string // Shown in autocomplete tooltip
  nullable?: boolean // Default: false
  items?: OutputField // For array types — describes item shape
  properties?: Record<string, OutputField> // For object types — describes shape
}
```

### Flat Example

```json
{
  "chargeId": { "type": "string", "description": "Stripe charge ID (ch_...)" },
  "success": { "type": "boolean", "description": "Whether the charge was captured" },
  "amount": { "type": "number", "description": "Amount charged in cents" }
}
```

### Nested Object Example

```json
{
  "user": {
    "type": "object",
    "description": "Created user record",
    "properties": {
      "id": { "type": "string" },
      "email": { "type": "string" },
      "createdAt": { "type": "string", "description": "ISO timestamp" }
    }
  }
}
```

### Array Example

```json
{
  "results": {
    "type": "array",
    "description": "List of matching records",
    "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "score": { "type": "number" }
      }
    }
  }
}
```

---

## Templates

Templates live in `templates/` and are named by provider: `cloudflare.ts`, `inngest.ts`, `temporal.ts`, `stepfunctions.json`.

### Template Rules

1. Export a **default async function** that accepts a single `ctx` parameter
2. Return an object that matches your `outputSchema`
3. **Do NOT** call `step.do()`, `step.sleep()`, or any durable execution primitives
4. **Do NOT** catch all errors silently — let errors propagate so the platform can retry
5. Use only Web APIs (fetch, crypto, URL, etc.) for Cloudflare templates — no Node.js APIs
6. Throw on non-2xx HTTP responses

### NodeContext Type

```typescript
interface NodeContext<TConfig = Record<string, unknown>> {
  config: TConfig // User-provided config values
  env: Record<string, string> // Environment variables / secrets
  inputs: Record<string, unknown> // Outputs from upstream steps
  workflow: {
    id: string // Workflow definition ID
    instanceId: string // This run's instance ID
    triggeredAt: string // ISO timestamp
  }
}
```

### Template Example (HTTP API call)

```typescript
import type { NodeContext } from '@awaitstep/node-sdk'

interface Config {
  amount: number
  currency: string
  customerId: string
  apiKey: never // secret — accessed via ctx.env, not ctx.config
}

interface Output {
  chargeId: string
  success: boolean
  amount: number
}

export default async function (ctx: NodeContext<Config>): Promise<Output> {
  const response = await fetch('https://api.example.com/charges', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.env.EXAMPLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: ctx.config.amount,
      currency: ctx.config.currency,
      customer: ctx.config.customerId,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as { id: string; captured: boolean; amount: number }

  return {
    chargeId: data.id,
    success: data.captured,
    amount: data.amount,
  }
}
```

### Template Example (Data Transform)

```typescript
import type { NodeContext } from '@awaitstep/node-sdk'

interface Config {
  fieldMapping: string // JSON mapping config
}

interface Output {
  transformedData: Record<string, unknown>
  fieldCount: number
}

export default async function (ctx: NodeContext<Config>): Promise<Output> {
  const mapping = JSON.parse(ctx.config.fieldMapping) as Record<string, string>
  const input = ctx.inputs as Record<string, unknown>

  const transformed: Record<string, unknown> = {}
  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    transformed[targetKey] = input[sourceKey]
  }

  return {
    transformedData: transformed,
    fieldCount: Object.keys(transformed).length,
  }
}
```

### Provider-Specific Notes

| Provider        | Environment            | Notes                                                                           |
| --------------- | ---------------------- | ------------------------------------------------------------------------------- |
| `cloudflare`    | CF Worker (V8 isolate) | Web APIs only. No `fs`, `path`, `process`, `Buffer`. Use `ctx.env` for secrets. |
| `inngest`       | Node.js or Edge        | Same function signature. Node.js APIs available.                                |
| `temporal`      | Temporal Activity      | Same function signature. No native `fetch` — use `node-fetch`.                  |
| `stepfunctions` | JSON ASL state         | Not TypeScript. JSON defining an ASL state for Lambda invocation.               |

---

## Error Handling

**Always throw on errors. Never swallow them.**

The platform depends on thrown errors for retry logic. If your template catches an error and returns a "success" result, the platform cannot retry the failed operation.

```typescript
// ✅ CORRECT — throw on error
if (!response.ok) {
  throw new Error(`API error (${response.status}): ${await response.text()}`)
}

// ❌ WRONG — swallowing the error
try {
  const result = await callApi()
  return { success: true, data: result }
} catch (err) {
  return { success: false, error: err.message } // Platform can't retry!
}
```

---

## Testing

Every template must have a corresponding test file in `tests/`.

### Test Requirements

- At minimum: one happy-path test and one error-path test per template
- All tests must pass with `vitest run`
- Mock `fetch` and all external dependencies — no real network calls
- Test that errors are thrown (not swallowed)
- Use `createMockContext` from `@awaitstep/node-sdk/testing`

### Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockContext } from '@awaitstep/node-sdk/testing'
import handler from '../templates/cloudflare'

const mockConfig = {
  // Fill with valid test config
}

const mockEnv = {
  // Fill with fake secrets
}

describe('<node_id> / cloudflare', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns expected output on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // Mock API response
      }),
    })

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    const result = await handler(ctx)

    expect(result).toEqual({
      // Expected output matching outputSchema
    })
  })

  it('throws on API error so the platform can retry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })

    await expect(handler(ctx)).rejects.toThrow()
  })

  it('sends correct authorization header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        /* mock response */
      }),
    })
    global.fetch = fetchSpy

    const ctx = createMockContext({ config: mockConfig, env: mockEnv })
    await handler(ctx)

    const [, options] = fetchSpy.mock.calls[0]
    expect(options.headers.Authorization).toContain(mockEnv.MY_API_KEY)
  })
})
```

---

## Validation Checklist

Before submitting a node, verify:

### node.json

- [ ] `id` matches directory name
- [ ] `id` matches `^[a-z][a-z0-9_]*$`
- [ ] `id` does not conflict with builtins: `step`, `sleep`, `sleep_until`, `branch`, `parallel`, `http_request`, `wait_for_event`
- [ ] `version` is valid semver
- [ ] `description` is present and under 120 characters
- [ ] `category` is a valid Category value
- [ ] `author` is present
- [ ] `license` is a valid SPDX identifier

### configSchema

- [ ] All field `type` values are valid FieldType values
- [ ] All `secret` fields declare `envVarName`
- [ ] All `select`/`multiselect` fields declare non-empty `options[]`
- [ ] Required fields are marked `required: true`

### outputSchema

- [ ] All field `type` values are valid OutputFieldType values
- [ ] `object` fields declare `properties`
- [ ] `array` fields declare `items`

### Templates

- [ ] At least one template file exists
- [ ] Each provider in `providers` has a corresponding template file
- [ ] Templates export a default async function accepting `ctx`
- [ ] Templates do not call `step.do`, `step.sleep`, `step.sleepUntil`, `step.waitForEvent`
- [ ] Templates throw on errors (no silent error swallowing)
- [ ] Secrets accessed via `ctx.env`, not `ctx.config`
- [ ] No `console.log` of secret values

### Tests

- [ ] At least one test file per template
- [ ] Happy-path and error-path tests exist
- [ ] All tests pass with `vitest run`
- [ ] No real network calls (fetch is mocked)

### README

- [ ] File exists and is non-empty
- [ ] Contains configuration table
- [ ] Contains output table

---

## Common Mistakes

1. **Catching errors instead of throwing** — The platform needs thrown errors for retry. Never return `{ success: false }` on failure.

2. **Storing secrets in config** — Use `type: "secret"` with `envVarName` and access via `ctx.env.SECRET_NAME`.

3. **Using Node.js APIs in Cloudflare templates** — No `fs`, `path`, `process`, `Buffer`. Use Web APIs only.

4. **Calling durable primitives** — Never call `step.do()`, `step.sleep()`, etc. in templates. The platform wraps your code automatically.

5. **Missing `options` on select/multiselect fields** — These fields require a non-empty `options` array.

6. **Missing `envVarName` on secret fields** — Every secret field must specify which env var to bind.

7. **Logging secrets** — Never `console.log(ctx.env.API_KEY)`. This will be caught in review.

8. **Output schema mismatch** — The template return value must match `outputSchema` exactly. Missing or extra fields will fail type-checking.

---

## Reference Example

See `packages/ir/src/bundled-nodes/http-request.ts` for a complete, production example of a node definition with config schema, output schema, and all required fields.
