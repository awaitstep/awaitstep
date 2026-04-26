---
title: Workflow IR Schema
---

# Workflow IR Schema

The Intermediate Representation (IR) is the JSON format that describes a workflow. It is the source of truth — AwaitStep stores the IR, validates it, and compiles it to executable TypeScript.

## Top-level shape

```typescript
type ArtifactIR = WorkflowIR | ScriptIR

interface WorkflowIR {
  kind?: 'workflow' // Optional — absent = workflow (back-compat with legacy IRs)
  metadata: WorkflowMetadata
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: string
  trigger?: TriggerConfig
}

interface ScriptIR extends Omit<WorkflowIR, 'kind' | 'trigger'> {
  kind: 'script' // Required
  trigger: HttpTriggerConfig // Required — scripts are HTTP-only
}
```

The `kind` discriminator decides which artifact compiles. Workflows produce a `WorkflowEntrypoint` class; scripts produce a fetch-only Worker. Validation dispatches via `validateArtifact(ir)` (or call `validateIR` / `validateScript` directly).

## WorkflowMetadata

```typescript
interface WorkflowMetadata {
  name: string // Workflow display name
  description?: string // Optional description
  version: number // Integer, auto-incremented by the platform
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp
}
```

## WorkflowNode

```typescript
interface WorkflowNode {
  id: string // Unique node ID within the workflow (slug format)
  type: string // Node type — builtin or marketplace node ID
  name: string // Display name shown on the canvas
  position: { x: number; y: number } // Canvas position (cosmetic only)
  version: string // Node definition version (semver)
  provider: string // Execution provider (e.g. "cloudflare")
  data: Record<string, unknown> // Node-specific config (matches configSchema)
  config?: StepConfig // Optional retry/timeout overrides
}

interface StepConfig {
  retries?: {
    limit: number // Max retry attempts (non-negative integer)
    delay: number | string // Delay between retries (seconds or duration string)
    backoff?: 'constant' | 'linear' | 'exponential'
  }
  timeout?: number | string // Step timeout (seconds or duration string)
}
```

## Edge

```typescript
interface Edge {
  id: string // Unique edge ID
  source: string // Source node ID
  target: string // Target node ID
  label?: string // Used by container nodes (branch conditions, loop body, etc.)
}
```

### Edge labels

| Context         | Label                  | Meaning                                |
| --------------- | ---------------------- | -------------------------------------- |
| Branch node     | branch condition label | Which branch this edge belongs to      |
| Loop node       | `body`                 | The loop body chain                    |
| Try/Catch node  | `try`                  | The try block chain                    |
| Try/Catch node  | `catch`                | The catch block chain                  |
| Try/Catch node  | `finally`              | The finally block chain                |
| After container | `then`                 | Continues after the container resolves |

## TriggerConfig

```typescript
type TriggerConfig =
  | { type: 'manual' }
  | { type: 'http'; path?: string; method?: 'GET' | 'POST' | 'PUT' | 'DELETE' }
  | { type: 'cron'; expression: string }
  | { type: 'event'; eventType: string }
```

## Builtin node types

| Type             | Description                           | Workflow | Script               |
| ---------------- | ------------------------------------- | -------- | -------------------- |
| `step`           | Custom TypeScript code block          | ✅       | ✅                   |
| `sleep`          | Pause for a duration                  | ✅       | ❌                   |
| `sleep_until`    | Pause until a timestamp               | ✅       | ❌                   |
| `branch`         | Conditional routing (if/else if/else) | ✅       | ✅                   |
| `parallel`       | Concurrent branches (`Promise.all`)   | ✅       | ✅                   |
| `race`           | First-wins branches (`Promise.race`)  | ✅       | ✅                   |
| `http_request`   | HTTP API call                         | ✅       | ✅                   |
| `wait_for_event` | Pause until an external event arrives | ✅       | ❌                   |
| `try_catch`      | Error handling block                  | ✅       | ✅                   |
| `loop`           | forEach / while / times iteration     | ✅       | ✅                   |
| `break`          | Exit the current loop                 | ✅       | ✅                   |
| `sub_workflow`   | Invoke another deployed workflow      | ✅       | ✅ (fire-and-forget) |

Nodes marked ❌ for script require a durable runtime and are rejected by `validateScript` with a clear error. The web canvas surfaces the same constraint at publish time.

## Complete example

```json
{
  "metadata": {
    "name": "Order Notification",
    "description": "Send an email when an order is placed",
    "version": 1,
    "createdAt": "2026-04-04T09:00:00.000Z",
    "updatedAt": "2026-04-04T09:00:00.000Z"
  },
  "nodes": [
    {
      "id": "parse_order",
      "type": "step",
      "name": "Parse Order",
      "position": { "x": 100, "y": 100 },
      "version": "1.0.0",
      "provider": "cloudflare",
      "data": {
        "code": "return { orderId: event.payload?.orderId, email: event.payload?.email };"
      }
    },
    {
      "id": "send_email",
      "type": "http_request",
      "name": "Send Email",
      "position": { "x": 100, "y": 250 },
      "version": "1.0.0",
      "provider": "cloudflare",
      "data": {
        "method": "POST",
        "url": "https://api.resend.com/emails",
        "headers": "{\"Authorization\": \"Bearer &#123;&#123;env.RESEND_API_KEY&#125;&#125;\"}",
        "body": "{\"to\": \"&#123;&#123;parse_order.email&#125;&#125;\", \"subject\": \"Order confirmed\"}"
      },
      "config": {
        "retries": { "limit": 3, "delay": "10 seconds", "backoff": "exponential" }
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "parse_order",
      "target": "send_email"
    }
  ],
  "entryNodeId": "parse_order",
  "trigger": {
    "type": "http",
    "method": "POST"
  }
}
```

## Submitting an IR via API

Post the IR to create a new version:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/wf_abc123/versions \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{ "ir": { /* WorkflowIR object */ } }'
```

The platform validates the IR (schema + expression references + cycle detection) and returns a version ID on success, or a list of validation errors on failure.

## Validation rules

- `nodes` must contain at least one node.
- `entryNodeId` must reference a node that exists in `nodes`.
- All `edges` must reference node IDs that exist in `nodes`.
- No cycles in the edge graph (DAG constraint).
- Expression references (`<span v-pre>&#123;&#123;nodeId.path&#125;&#125;</span>`) must point to upstream nodes only.
- `select`/`multiselect` field values must be one of the declared `options`.
- Duration strings must be parseable (e.g. `"30 seconds"`, `"2 hours"`).

### Script-only rules

When `kind === "script"`, additional constraints apply:

- `trigger.type` must be `"http"`. Cron, event, and manual triggers are rejected.
- `nodes` must not include `sleep`, `sleep_until`, or `wait_for_event`.
