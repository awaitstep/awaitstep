# Node Types

AwaitStep ships 12 built-in nodes. A step node is wrapped in `flow.step()` by the compile pipeline, giving it durable execution, automatic retries, and persistent output storage; an HTTP node is a plain request unless it is marked durable. The generated module imports `#awaitstep/runtime` and is provider-neutral: even `sub_workflow` and `sub_script` call the runtime's platform adapter, which the provider implements over its own primitives.

## step

Run arbitrary TypeScript inside a durable step. The platform retries automatically on throw.

| Field        | Type     | Required | Default       | Description                                                                                                             |
| ------------ | -------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `code`       | `code`   | yes      | —             | TypeScript to execute. `ctx.attempt` holds the current retry count (1-indexed). Return value must be JSON-serializable. |
| `retryLimit` | `number` | no       | 2             | Max retry attempts.                                                                                                     |
| `retryDelay` | `string` | no       | `5 seconds`   | Delay between retries.                                                                                                  |
| `backoff`    | `select` | no       | `exponential` | Backoff strategy: `exponential`, `linear`, or `constant`.                                                               |
| `timeout`    | `string` | no       | —             | Per-attempt timeout (e.g. `10 minutes`).                                                                                |

```typescript
// Generated code
const my_step_result = await flow.step('my_step', { retries: { limit: 5 } }, async () => {
  const data = await fetch('https://api.example.com/data').then((r) => r.json())
  return { value: data.value }
})
```

---

## branch

Route execution to one of several paths based on conditions. Each outgoing edge carries a condition expression that is evaluated at runtime. The first truthy condition wins.

| Field    | Type | Required | Description                                             |
| -------- | ---- | -------- | ------------------------------------------------------- |
| _(none)_ | —    | —        | Conditions are set on the outgoing edges in the canvas. |

```typescript
// Generated code
if (charge_result.success) {
  // "success" branch ...
} else {
  // "failure" branch ...
}
```

---

## parallel

Execute multiple branches concurrently. Execution resumes after the last branch completes.

| Field    | Type | Required | Description                                     |
| -------- | ---- | -------- | ----------------------------------------------- |
| _(none)_ | —    | —        | Branches are the outgoing edges from this node. |

```typescript
// Generated code
await Promise.all([
  step.do('notify_slack', async () => {
    /* ... */
  }),
  step.do('send_email', async () => {
    /* ... */
  }),
])
```

---

## loop

Repeat a set of steps using `forEach`, `while`, or a fixed count.

| Field        | Type         | Required | Default   | Description                                           |
| ------------ | ------------ | -------- | --------- | ----------------------------------------------------- |
| `loopType`   | `select`     | yes      | `forEach` | `forEach`, `while`, or `times`.                       |
| `collection` | `expression` | no       | —         | Array to iterate over (`forEach` only).               |
| `itemVar`    | `string`     | no       | `item`    | Variable name for the current item (`forEach` only).  |
| `indexVar`   | `string`     | no       | `i`       | Variable name for the current index (`forEach` only). |
| `condition`  | `expression` | no       | —         | Continue condition (`while` only).                    |
| `count`      | `number`     | no       | 5         | Number of iterations (`times` only).                  |

**Output:** `results` — array of results collected from each iteration.

```typescript
// Generated code (forEach)
const loop_results = []
for (const [i, item] of get_orders_result.orders.entries()) {
  const iter_result = await step.do(`loop_iter_${i}`, async () => {
    return processOrder(item)
  })
  loop_results.push(iter_result)
}
```

---

## break

Exit a loop early or stop workflow execution entirely, optionally based on a condition.

| Field       | Type         | Required | Description                                                                   |
| ----------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `condition` | `expression` | no       | JS expression — breaks only when truthy. Leave empty for unconditional break. |

```typescript
// Generated code (inside a loop)
if (poll_result.status === 'complete') {
  break
}
```

---

## race

Run multiple branches concurrently. The first branch to complete wins; all others are cancelled.

| Field    | Type | Required | Description                                     |
| -------- | ---- | -------- | ----------------------------------------------- |
| _(none)_ | —    | —        | Branches are the outgoing edges from this node. |

```typescript
// Generated code
const race_result = await Promise.race([
  step.do('path_a', async () => {
    /* ... */
  }),
  step.do('path_b', async () => {
    /* ... */
  }),
])
```

---

## try_catch

Wrap a group of steps in try/catch/finally error handling. Connect nodes to the `try`, `catch`, and `finally` edges.

| Field    | Type | Required | Description                                                 |
| -------- | ---- | -------- | ----------------------------------------------------------- |
| _(none)_ | —    | —        | Error handling paths are the outgoing edges from this node. |

```typescript
// Generated code
try {
  await step.do('risky_operation', async () => {
    /* ... */
  })
} catch (err) {
  await step.do('handle_error', async () => {
    /* ... */
  })
} finally {
  await step.do('cleanup', async () => {
    /* ... */
  })
}
```

---

## sleep

Pause workflow execution for a duration. Does not count against the step limit.

| Field      | Type     | Required | Description                                                                |
| ---------- | -------- | -------- | -------------------------------------------------------------------------- |
| `duration` | `string` | yes      | Duration string (e.g. `10 seconds`, `5 minutes`, `2 hours`). Max 365 days. |

```typescript
// Generated code
await step.sleep('wait', '5 minutes')
```

---

## sleep_until

Pause workflow execution until a specific ISO 8601 timestamp.

| Field       | Type     | Required | Description                                                                        |
| ----------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| `timestamp` | `string` | yes      | ISO 8601 datetime (e.g. `2025-12-31T09:00:00Z`). Must be at least 1 hour from now. |

```typescript
// Generated code
await step.sleepUntil('wait_until', '2025-12-31T09:00:00Z')
```

---

## wait_for_event

Pause execution until an external event is sent to this workflow instance via the `sendEvent` API.

| Field       | Type     | Required | Description                                                                                                          |
| ----------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `eventType` | `string` | yes      | Event type identifier. `a-z 0-9 - _` only, max 100 chars.                                                            |
| `timeout`   | `string` | yes      | Max wait time (e.g. `24 hours`, default `365 days`). Max 365 days. Select the **on-event** and **on-timeout** paths. |

**Output:** `payload` — the event payload object sent via `sendEvent()`.

The timeout handling lives in the runtime helper `waitForEventOrTimeout`, so the generated code
keeps a plain `const`: the helper runs `waitForEvent` in a `try...catch` — the idiom Cloudflare
documents — returns the event payload, and resolves the timeout sentinel instead of rejecting. Only
the wait is inside the try, so an error from the on-event path is never mistaken for the wait timing
out, and no variable is left declared outside the wait.

```typescript
// Generated code
const approval_result = await waitForEventOrTimeout(flow, 'wait_for_approval', {
  type: 'user-approval',
  timeout: '24 hours',
})

if (typeof approval_result === 'symbol') {
  // on-timeout path
} else {
  // on-event path
}
```

---

## http_request

Make an HTTP API call. Supports all common HTTP methods, custom headers, and request bodies.

| Field         | Type      | Required | Default | Description                                                        |
| ------------- | --------- | -------- | ------- | ------------------------------------------------------------------ |
| `method`      | `select`  | yes      | `GET`   | HTTP method.                                                       |
| `url`         | `string`  | yes      | —       | Request URL. Must be a valid URL.                                  |
| `queryParams` | `json`    | no       | —       | Query parameters, appended to the URL by the runtime.              |
| `headers`     | `json`    | no       | —       | JSON object of request headers.                                    |
| `body`        | `code`    | no       | —       | Request body. Used for POST, PUT, PATCH.                           |
| `retryLimit`  | `number`  | no       | 2       | Max retry attempts. Applies only when `durable` is on.             |
| `timeout`     | `string`  | no       | —       | Request timeout. Applies only when `durable` is on.                |
| `durable`     | `boolean` | no       | `false` | Run the request inside a step: retries, timeout, durability.       |
| `export`      | `boolean` | no       | `false` | In a function, return the response under `exportAs` (or its name). |
| `exportAs`    | `string`  | no       | —       | The response key.                                                  |

**Output:** the parsed JSON body, as `T`. The runtime reads the response with
`response.json()`; a non-JSON response rejects the step (and its retries apply).

By default an HTTP node is a plain request — no step, no retries, no timeout:

```typescript
const fetch_user_result = await flow.http({
  url: 'https://api.example.com/user',
  headers: { Authorization: 'Bearer token' },
})
```

A **durable** node wraps the same call in a step, which buys retries, a timeout and — in a
workflow — a call that survives a restart:

```typescript
const fetch_user_result = await flow.step(
  'fetch_user',
  { retries: { limit: 2, delay: '5 seconds' } },
  async () =>
    flow.http({ url: 'https://api.example.com/user', headers: { Authorization: 'Bearer token' } }),
)
```

The node's fields are split into tabs — **Headers**, **Query**, and **Body**, the last only for a
method that sends one — so the panel does not stack three editors.

In a function the call is the same `flow.http({…})`. The context around it is built without a host
when nothing runs a step, so a plain request pulls in neither `createInlineHost` nor the step
adapter; mark the node durable and it becomes `flow.step(<id>, {…}, async () => flow.http({…}))`,
with the in-request host supplying the retries.

Step bodies do not receive `flow`: they still call `fetch` (inside a step, so
retries apply). A node is in a function's response only when its _Return this
value_ switch is on
(or its name starts with `EXPORT_`); a sub-workflow and a sub-script start with
that switch on, a step and an HTTP call with it off.

---

## sub_workflow

Call another deployed workflow, optionally waiting for it to complete before continuing.

| Field               | Type         | Required | Default     | Description                                                             |
| ------------------- | ------------ | -------- | ----------- | ----------------------------------------------------------------------- |
| `workflowId`        | `string`     | yes      | —           | The target workflow's AwaitStep id or deployed name.                    |
| `workflowName`      | `string`     | no       | —           | Provider export name (Cloudflare: the exported workflow class).         |
| `input`             | `expression` | no       | —           | Expression for params passed to the child workflow.                     |
| `waitForCompletion` | `boolean`    | no       | `true`      | Block until the child workflow finishes.                                |
| `timeout`           | `string`     | no       | `5 minutes` | Max time to wait for child completion.                                  |
| `params`            | `json`       | no       | —           | Provider-scoped settings, e.g. `{ "cf": { "binding": "CHILD_FLOW" } }`. |

**Output:**

| Field        | Type     | Description                    |
| ------------ | -------- | ------------------------------ |
| `instanceId` | `string` | The child workflow instance ID |

```typescript
// Generated code
const child_instance = await flow.step('child--create', () =>
  flow.startWorkflow({
    workflow: 'order-fulfillment',
    exportName: 'OrderFulfillment',
    input: charge_result,
  }),
)

const child = await flow.step(
  'child--await',
  { retries: { limit: 60, delay: '5 seconds' } },
  async () => {
    const status = await flow.workflowStatus(child_instance.instanceId, {
      workflow: 'order-fulfillment',
      exportName: 'OrderFulfillment',
    })
    if (status.status === 'complete') return status.output
    throw new Error('Still running')
  },
)
```
