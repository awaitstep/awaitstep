# Workflow IR

The Intermediate Representation (IR) is a provider-agnostic, JSON-serializable description of a workflow. It is the single source of truth — the database stores the IR, and all code generation reads from it.

## Why a Separate IR?

The canvas (XYFlow) stores spatial data: positions, selection state, UI metadata. The IR strips all of that away and keeps only what matters for execution. This separation means:

- The same IR can be compiled to Cloudflare, Inngest, or Temporal without changing the canvas.
- Validation runs against the IR, not against canvas state.
- The IR can be hand-authored or generated programmatically, independent of the UI.

## WorkflowIR Type

```typescript
interface WorkflowIR {
  metadata: WorkflowMetadata
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: NodeId // ID of the first node to execute
  trigger?: TriggerConfig // Optional — how the workflow is invoked
}

interface WorkflowMetadata {
  name: string
  description?: string
  version: number // Integer, auto-incremented on each save
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

interface WorkflowNode {
  id: NodeId // Unique within this workflow, e.g. "charge_card"
  type: NodeType // Built-in: "step", "branch", etc. Custom: "stripe_charge"
  name: string // Human label shown on the canvas
  position: { x: number; y: number }
  version: string // Node definition semver, e.g. "1.0.0"
  provider: string // Provider this node targets, e.g. "cloudflare"
  data: Record<string, unknown> // Config values from the config drawer
  config?: StepConfig // Per-node retry / timeout overrides
}

interface StepConfig {
  retries?: {
    limit: number
    delay: number | string // e.g. "10 seconds"
    backoff?: 'constant' | 'linear' | 'exponential'
  }
  timeout?: number | string // Per-attempt timeout
}

interface Edge {
  id: EdgeId
  source: NodeId
  target: NodeId
  label?: string // Used on branch edges to identify the condition path
}
```

## Triggers

Triggers describe how a workflow run is initiated. If omitted, the workflow can only be started manually.

```typescript
type TriggerConfig =
  | { type: 'http'; path?: string; method?: 'GET' | 'POST' | 'PUT' | 'DELETE' }
  | { type: 'cron'; expression: string } // UNIX cron expression
  | { type: 'event'; eventType: string } // e.g. "user-signup"
  | { type: 'manual' }
```

### HTTP Trigger Example

```json
{
  "trigger": {
    "type": "http",
    "path": "/webhooks/stripe",
    "method": "POST"
  }
}
```

### Cron Trigger Example

```json
{
  "trigger": {
    "type": "cron",
    "expression": "0 9 * * 1"
  }
}
```

## Expression System

Nodes can reference the output of upstream nodes using the `<span v-pre>&#123;&#123;nodeId.property&#125;&#125;</span>` expression syntax. Expressions are valid in any `expression`-typed config field and are resolved by the codegen pipeline at build time.

### Syntax

```
&#123;&#123;nodeId.property.nestedProperty&#125;&#125;
```

- `nodeId` — the `id` of an upstream `WorkflowNode`
- `property` — a key in that node's output schema
- Additional `.`-separated segments for nested object access

### Examples

```
&#123;&#123;fetch_user.email&#125;&#125;
&#123;&#123;charge_result.amount&#125;&#125;
&#123;&#123;get_orders.results.0.id&#125;&#125;
```

### How Expressions Are Resolved

The codegen pipeline performs a topological sort of the DAG and assigns each node a JavaScript variable name. At code generation time, `<span v-pre>&#123;&#123;nodeId.property&#125;&#125;</span>` becomes a direct JavaScript property access:

```typescript
// Before resolution (in IR data field):
"to": "&#123;&#123;fetch_user.email&#125;&#125;"

// After resolution (in generated worker code):
const sendEmail_result = await step.do('sendEmail', async () => {
  return sendEmail({ to: fetch_user_result.email })
})
```

### Validation

The IR validator checks that:

- Every expression references a node that exists in the workflow.
- The referenced node is topologically upstream of the current node (no forward references).
- Expressions do not reference the node itself.

## Minimal IR Example

```json
{
  "metadata": {
    "name": "Welcome Email",
    "version": 1,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  },
  "entryNodeId": "fetch_user",
  "trigger": { "type": "manual" },
  "nodes": [
    {
      "id": "fetch_user",
      "type": "http_request",
      "name": "Fetch User",
      "position": { "x": 0, "y": 0 },
      "version": "1.0.0",
      "provider": "cloudflare",
      "data": {
        "method": "GET",
        "url": "https://api.example.com/users/&#123;&#123;trigger.userId&#125;&#125;"
      }
    },
    {
      "id": "send_email",
      "type": "resend_send_email",
      "name": "Send Welcome Email",
      "position": { "x": 0, "y": 200 },
      "version": "1.0.0",
      "provider": "cloudflare",
      "data": {
        "to": "&#123;&#123;fetch_user.body&#125;&#125;",
        "subject": "Welcome!"
      }
    }
  ],
  "edges": [{ "id": "e1", "source": "fetch_user", "target": "send_email" }]
}
```
