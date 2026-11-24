# The workflow IR

The IR is the version's source of truth. The canvas, Code, codegen and deploy
all read it. A workflow is a JSON document; project files sit beside it and are
folded into the version on save.

## Shape

```ts
interface WorkflowIR {
  kind?: 'workflow' // absent on legacy documents; 'script' for a Function
  irVersion: 3
  metadata: {
    name: string
    description?: string
    version: number // integer, the version's own counter
    createdAt: string // ISO timestamp
    updatedAt: string // ISO timestamp
  }
  nodes: WorkflowNode[]
  edges: Edge[]
  entryNodeId: string
  runtime?: {
    provider?: string
    env?: { name: string; secret?: boolean; required?: boolean; description?: string }[]
    resources?: {
      name: string
      kind: string
      provider?: string
      resourceId?: string
      resourceName?: string
    }[]
  }
}
```

A Function adds `"kind": "script"`. Both kinds are described by the same node
graph; the wrapper and the allowed nodes differ (see `awaitstep-functions`).

## A node

```ts
interface WorkflowNode {
  id: string // unique, stable, snake_case is easiest to read
  type: string // builtin id, a registry node id, or "custom:<itemId>"
  name: string // human label; the generated variable name comes from this
  position?: { x: number; y: number }
  version: string // node definition version, e.g. "1.0.0"
  provider?: string // "cloudflare"
  data: Record<string, unknown> // the node's config values
  config?: {
    retries?: {
      limit: number
      delay: number | string
      backoff?: 'constant' | 'linear' | 'exponential'
    }
    timeout?: number | string
  }
}
```

- `id` is what expressions name. Renaming a node's display name does not change
  its id; codegen's variable name does follow the display name.
- `position` is cosmetic for execution but the canvas draws it. Put the entry at
  `{ "x": 0, "y": 0 }` and move down by 180 per step; branch arms at
  `x: -320` / `x: 320`; return to `x: 0` at a join. Do not overlap nodes.
  Arms that hold parallels or other arms need more width; the
  `awaitstep-canvas` skill's Layout section has the rule, and wins where the
  two differ.
- `data` holds the node's own fields. The built-in shapes are in
  `node-data.md`; a registry or custom node's fields come from its
  `configSchema` (`GET /nodes`, `GET /workflows/:id/custom-nodes`).
- `config` is provider-level retry/timeout for the whole node. A `step` node's
  own `data.retryLimit` / `data.retryDelay` / `data.backoff` / `data.timeout`
  are the ones the canvas writes; use those for steps.

## Edges

```ts
interface Edge {
  id: string // unique within the document
  source: string // node id
  target: string // node id
  label?: string // the arm, or "then" for a block's way on
  sourceSide?: 'bottom' | 'right' // canvas layout only; omit it
  targetSide?: 'top' | 'left' // canvas layout only; omit it
}
```

`sourceSide` / `targetSide` record the canvas sides a person dragged the edge
between. They change nothing in the generated code. Leave them out and the
canvas works the sides out from node positions.

The graph is a DAG. Every node except the entry should have a way in, and every
edge must name existing nodes. Duplicate node ids are refused. A cycle is
refused.

Labels are not decoration:

- **`then`** — the way on after a block (loop, try/catch, parallel, race, wait).
  It is not an arm.
- **Branch arms** — the label must equal a `data.branches[].label` value. Only
  the first edge under that label runs.
- **`body`** — a loop's body.
- **`try`, `catch`, `finally`** — a try/catch's arms.
- **`onEvent`, `onTimeout`** — a wait's arms (also settable by the node's
  `onEventNode` / `onTimeoutNode` fields; a set field wins).
- **Parallel and race arms** — any label except `then`; they take any number.

An arm may lead into a chain of single-entry nodes. It may not lead straight
into a node that another path also reaches: put a step inside the arm first.

## Entry node

`entryNodeId` must name a node in `nodes`. The canvas picks the node no edge
targets (when there are several, the one with the most descendants). For a
programmatic build, set the first node explicitly.

## Saving a version

`POST /workflows/:id/versions` takes:

```json
{
  "ir": { "irVersion": 3, "metadata": {}, "nodes": [], "edges": [], "entryNodeId": "" },
  "baseGraphHash": "…"
}
```

- `baseGraphHash` is the `graphHash` from `GET /full` or the last save. It
  covers the graph — nodes, edges, node code and settings, `runtime.env` and
  `runtime.resources` — not `metadata` or the project-file snapshot.
- Omit it for a workflow with no version. Never omit it for a later write.
- A save whose latest version was never deployed overwrites it in place; once
  deployed, a save creates the next version.
- The response is the version row plus `graphHash`.
- `400` means the IR is invalid (`details` lists the paths). `409` means the
  graph moved; re-read and ask.

## Runtime block

The canvas writes only what it owns:

```json
{
  "runtime": {
    "provider": "cloudflare",
    "env": [{ "name": "RESEND_API_KEY", "secret": true }],
    "resources": [{ "name": "ORDERS", "kind": "d1", "provider": "cloudflare" }]
  }
}
```

`runtime.env` declares **names and secrecy only**; values live in the dashboard.
`runtime.resources` declares provider resources by name; physical IDs belong to
the deployment connection.

Do **not** put `runtime.files`, `runtime.triggerCode` or `runtime.dependencies`
in a save. Project files own them (`handlers/…`, `package.json`); a stale copy is
dropped on save. Use the files API in `awaitstep-ide`.

## Programmatic builds

1. `GET /nodes` and `GET /workflows/:id/custom-nodes` for the catalog.
2. Build nodes with ids and names you can predict, and positions that read.
3. Build edges, then `entryNodeId`.
4. Save, then `POST /source/check`.
5. On `400`, read every `details[].path` and fix it; on `409`, re-read.

The examples beside this reference are complete documents: `webhook-order.json`,
`branch-and-loop.json`, `try-catch.json`.
