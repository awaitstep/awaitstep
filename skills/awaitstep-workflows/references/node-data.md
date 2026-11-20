# Node data and arms

`GET /nodes` is the live catalog. Use this table to plan, then read the
definition's `configSchema` / `outputSchema` before writing `data`. A field the
schema does not have is not passed to codegen.

## Built-in nodes

### `step`

```json
{
  "type": "step",
  "data": {
    "code": "export default async function fetch_order({ event, inputs }) { … }",
    "inline": false,
    "retryLimit": 2,
    "retryDelay": "5 seconds",
    "backoff": "exponential",
    "timeout": "10 minutes",
    "export": false,
    "exportAs": ""
  }
}
```

- `code` — a module (see `step-code.md`) or, with `inline: true`, raw statements.
- `retryLimit` / `retryDelay` / `backoff` / `timeout` — retry and per-attempt
  timeout. Leave them out for the defaults (2 retries, 5 seconds, exponential).
- `export` / `exportAs` — put this step's value in a Function's response. The
  key defaults to the step's variable name.

Output: whatever the code returns, which downstream nodes reach as
`{{nodeId.<field>}}` or `inputs.<var>`.

### `http_request`

```json
{
  "type": "http_request",
  "data": {
    "method": "POST",
    "url": "https://api.example.com/orders/{{fetch_order.id}}",
    "headers": { "Accept": "application/json" },
    "queryParams": { "region": "eu" },
    "body": "JSON.stringify({ orderId: fetch_order.id })",
    "durable": true,
    "retryLimit": 2,
    "timeout": "10 minutes"
  }
}
```

Output: the **parsed body** when the reply is JSON, its text when it is not,
or `null` when empty. It is not a `{ status, body }` envelope, and a non-2xx
reply **throws** (`HttpError`) rather than returning. `body` is only used for
POST/PUT/PATCH; it accepts an expression or a JSON/JS literal. A secret is not
an expression: to send an authenticated request, use a `step` that reads
`env.<NAME>` and calls `fetch`, never a header config carrying the value.

The node is **not durable by default**: `retryLimit`, `timeout` and the step
record apply only with `"durable": true`. `durable` is not in the catalog's
`configSchema`; set it in `data` anyway. Without it the request runs in the
surrounding body and a failure throws there.

The palette's legacy output fields (`status`, `body`, `headers`) do **not**
describe this value; the runtime returns the parsed body itself. Do not build
an expression on `.body`; use the body's own fields.

### `sleep`

`data.duration` — e.g. `"10 seconds"`, `"2 days"`; up to 365 days. No output.
Refused in a Function.

### `sleep_until`

`data.timestamp` — ISO 8601, at least one hour from now. No output. Refused in a
Function.

### `branch`

```json
{
  "type": "branch",
  "data": {
    "branches": [
      { "label": "approved", "condition": "review.decision === 'approved'" },
      { "label": "rejected", "condition": "review.decision === 'rejected'" },
      { "label": "fallback", "condition": "" }
    ]
  }
}
```

- Arms are edges whose `label` equals a branch label, in order. The first edge
  under a label is the arm; any other edge under it runs nowhere.
- An empty `condition` is the `else`. Include one.
- Conditions are JavaScript; upstream step variables are in scope (the same
  names step code uses). `{{…}}` in a condition is resolved too, but write what
  the canvas writes — a plain condition.
- A shared next node that every arm reaches is the join; codegen runs it inside
  each arm. An optional `then` edge is the block's way on when there is no join.

No output.

### `parallel`

No data. Every edge except `then` starts an arm; all run concurrently, and the
node's value is their settled results. A `then` edge continues after all arms.

### `race`

No data. Every edge except `then` starts an arm; the first to finish wins and
the others are abandoned (their current step still completes). The node's value
is the winner's; a `then` edge continues after it.

### `try_catch`

No data. Arms are labelled `try`, `catch` and `finally`; `then` continues after
the block. A step in the catch arm reads the error as `inputs.error` (or
`error` in inline code). Use it for failures the graph should handle rather
than fail the run.

### `loop`

```json
{
  "type": "loop",
  "data": {
    "loopType": "forEach",
    "collection": "{{fetch_orders.items}}",
    "itemVar": "order",
    "indexVar": "i"
  }
}
```

- `loopType`: `forEach`, `while` or `times`.
- `collection` — an expression resolving to an array (`forEach`).
- `itemVar` — the name the body binds the item under (default `item`).
  `indexVar` is accepted by the schema but codegen exposes the index as
  `inputs.index` (not renamed).
- `condition` — JS condition (`while`); make sure the body can make it false.
- `count` — number of iterations (`times`), at least 1.
- The body is the edge labelled `body`; the way on is `then`.
- Output: the **last value a body step returned** (a later body step wins). The
  definition's `results` field is the palette's name, not a collected array;
  read a field of the object your body returns with `{{loop.<field>}}`.

### `break`

`data.condition` — JS expression; empty breaks unconditionally. Place inside a
loop (usually in a branch). No output.

### `wait_for_event`

```json
{
  "type": "wait_for_event",
  "data": {
    "eventType": "user-approval",
    "timeout": "365 days",
    "onEventNode": "",
    "onTimeoutNode": ""
  }
}
```

Pauses the run until an event arrives or the timeout expires. Arms are labelled
`onEvent` and `onTimeout`; a non-empty `onEventNode`/`onTimeoutNode` field wins
over the matching edge target. Output: `payload` (the event body). Refused in a
Function.

### `sub_workflow`

```json
{
  "type": "sub_workflow",
  "data": {
    "workflowId": "onboarding-workflow",
    "input": "fetch_order",
    "waitForCompletion": true,
    "timeout": "5 minutes"
  }
}
```

Calls another deployed workflow. `workflowId` is the target's AwaitStep id or
deployed name; `workflowName` is the provider export name when it has one.
`input` is a code expression for the child's params. With the default
`waitForCompletion: true` the node's value is the child's **output**; with
`waitForCompletion: false` (or always in a Function) it is the instance handle
`{ instanceId }`. Set `export: true` (optionally `exportAs`) to return the
handle from a Function; it defaults to exported there.

### `sub_script`

Calls another deployed Function. Fields: `scriptId`, `method`, `url` (a
placeholder the called Worker sees as its URL), `headers`, `body`, `retryLimit`,
`timeout`, `params`. Provider settings live under `params.<provider>`; the
Cloudflare adapter reads `params.cf.binding`. The value is the called
Function's **parsed body** (JSON, else text). Exported from a Function by
default.

### Registry and custom nodes

- **Registry / marketplace node** — `type` is the definition id (for example
  `slack`), `version` its installed version, and `data` the fields its
  `configSchema` declares. `GET /nodes` returns them.
- **Custom node** — `type` is `custom:<itemId>` (from
  `GET /workflows/:id/custom-nodes`), `version` is the latest published
  definition's version, and `data` uses its `configSchema`. See
  `awaitstep-custom-nodes`.

A custom or registry node is exportable from a Function with `export: true` and
`exportAs`; its own config never receives those two keys.

## Arms at a glance

| Type             | Arm labels                                  | Way on |
| ---------------- | ------------------------------------------- | ------ |
| `branch`         | each `data.branches[].label`, in order      | `then` |
| `parallel`       | any label except `then`, any number         | `then` |
| `race`           | any label except `then`, any number         | `then` |
| `try_catch`      | `try`, `catch`, `finally`                   | `then` |
| `loop`           | `body`                                      | `then` |
| `wait_for_event` | `onEvent`, `onTimeout` (or the node fields) | `then` |

An arm's node may be a chain of nodes with one way in each. It may not lead
straight into a node another path also reaches; insert a step inside the arm.
