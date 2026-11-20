# Step code

A step is a small module. The worker imports it and calls its default function
inside a durable step; retries, timeouts and the step boundary are the
platform's, not yours.

## The contract

```ts
export default async function fetch_order({
  env,
  event,
  inputs,
  step,
  ctx,
}: {
  env: Env
  event: { payload?: unknown }
  inputs: Record<string, unknown>
  step: unknown
  ctx: { attempt: number }
}) {
  // ...
}
```

The parameters, in the order the worker passes them:

| Name     | What it is                                                      |
| -------- | --------------------------------------------------------------- |
| `env`    | The deployed environment. Secrets and bindings by name.         |
| `event`  | The trigger: `event.payload` is the request/trigger body.       |
| `inputs` | Values of upstream steps, keyed by their variable names.        |
| `step`   | The durable host. Do not call `step.do`/`step.sleep` from here. |
| `ctx`    | `ctx.attempt` is the current attempt, 1-indexed.                |

The function must be **named exactly the step's variable name**. That name is
derived from the node's display `name`:

- characters other than `A-Z a-z 0-9 _` become `_`; runs collapse; a trailing
  `_` is dropped; a leading digit gets a `_` prefix;
- **case is preserved** — `Fetch order` becomes `Fetch_order`, not
  `fetch_order`;
- a name that is a runtime global (`fetch`, `Response`, `Date`, …) gets `_node`;
- a duplicate name gets `_2`, `_3`, … in document order.

So the simplest choice is a lowercase snake_case `name`: `fetch_order` gives
`fetch_order`. A human label such as `Fetch order` gives `Fetch_order`, and the
function must be exactly that. A save whose function name differs answers `400`
with "The function must be named `…`". The variable is also what downstream
steps read, and what `{{…}}` resolves to.

## Reading upstream values

Only nodes that run before this one are in `inputs`.

```ts
export default async function notify({
  env,
  inputs,
}: {
  env: Env
  inputs: Record<string, unknown>
}) {
  const order = inputs.fetch_order as { id: string; total: number }
  const response = await fetch('https://api.example.com/notify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.NOTIFY_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: order.id, total: order.total }),
  })
  if (!response.ok) throw new Error(`Notify failed: ${response.status}`)
  return { notified: true }
}
```

Equivalent:

```ts
const { fetch_order: order } = inputs
// or, in a body-shaped step, `fetch_order` is destructured for you.
```

Inside a container the block adds bindings:

- a loop body: `inputs.<itemVar>` (the loop's `itemVar`, default `item`) and
  `inputs.index`; the loop's `indexVar` field does not rename the input;
- a catch arm: `inputs.error`;
- inline code inside those blocks uses the loop's item name and `index`, and
  `error` in a catch arm.

An upstream step named like a binding loses to the binding, by design.

## Inline steps

`data.inline: true` means the code is **statements**, not a module:

```ts
const total = items.reduce((sum, item) => sum + item.price, 0)
return { total }
```

Inline code runs in the surrounding body. It has no retry, no timeout and no
step boundary, and in a workflow no durability. Use it for small glue; use a
module for work worth retrying or seeing in a run.

## Returning a value

`return` sets the step's value in the run and for downstream expressions. The
value must be serializable (JSON types). A step that returns nothing has no
value; do not reference it downstream.

A step module may import:

```ts
import { helper } from '#app/lib/helper'
import { score } from '#modules/lead-scoring'
```

`#app/` is the workflow project; `#modules/` is the Library. Imports are hoisted
into the generated worker. Do not use `fs`, `path`, `process`, `Buffer`, or
anything else Node-only. Use `fetch`, `crypto`, `URL`, `Response`, `TextEncoder`
and the other Web APIs.

## Retries, timeouts and exports

Set these on the node's `data`, not in the code:

```json
{
  "retryLimit": 3,
  "retryDelay": "10 seconds",
  "backoff": "exponential",
  "timeout": "2 minutes",
  "export": true,
  "exportAs": "order"
}
```

- `retryLimit` is the number of retries after the first attempt.
- `backoff` is `exponential`, `linear` or `constant`.
- `timeout` is per attempt.
- `export` / `exportAs` put this step's value in a Function's JSON response.
  A workflow ignores them.

Throw on failure. A caught error is a step that succeeded with a value; an
uncaught error is a retry and then a failed run, which is usually what you want.

## When a save is refused

- **"The function must be named …"** — the display name changed, or the
  function does not match. Fix the name (or rename the node) and save again.
- **"Inline steps hold statements, not a module."** — remove `inline` or
  convert the module to statements.
- **Step code is longer than 250,000 characters** — split it into a project
  helper (`#app/…`) or a Library module.
- **A reference to a downstream step** — expressions and `inputs` only see
  upstream values. Reorder the graph or carry the value through a step.
