# Node Types

AwaitStep ships 12 built-in nodes. Every node is automatically wrapped in `step.do()` by the compile pipeline, giving it durable execution, automatic retries, and persistent output storage.

## step

Run arbitrary TypeScript inside a durable step. The platform retries automatically on throw.

| Field        | Type     | Required | Default       | Description                                                                                                             |
| ------------ | -------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `code`       | `code`   | yes      | —             | TypeScript to execute. `ctx.attempt` holds the current retry count (1-indexed). Return value must be JSON-serializable. |
| `retryLimit` | `number` | no       | 5             | Max retry attempts.                                                                                                     |
| `retryDelay` | `string` | no       | `10 seconds`  | Delay between retries.                                                                                                  |
| `backoff`    | `select` | no       | `exponential` | Backoff strategy: `exponential`, `linear`, or `constant`.                                                               |
| `timeout`    | `string` | no       | —             | Per-attempt timeout (e.g. `10 minutes`).                                                                                |

```typescript
// Generated code
const my_step_result = await step.do('my_step', { retries: { limit: 5 } }, async () => {
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

| Field       | Type     | Required | Description                                                                        |
| ----------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| `eventType` | `string` | yes      | Event type identifier. `a-z 0-9 - _` only, max 100 chars.                          |
| `timeout`   | `string` | no       | Max wait time (e.g. `24 hours`). Workflow throws if timeout expires. Max 365 days. |

**Output:** `payload` — the event payload object sent via `sendEvent()`.

```typescript
// Generated code
const approval_result = await step.waitForEvent('wait_for_approval', {
  type: 'user-approval',
  timeout: '24 hours',
})
```

---

## http_request

Make an HTTP API call. Supports all common HTTP methods, custom headers, and request bodies.

| Field        | Type     | Required | Default | Description                              |
| ------------ | -------- | -------- | ------- | ---------------------------------------- |
| `method`     | `select` | yes      | `GET`   | HTTP method.                             |
| `url`        | `string` | yes      | —       | Request URL. Must be a valid URL.        |
| `headers`    | `json`   | no       | —       | JSON object of request headers.          |
| `body`       | `code`   | no       | —       | Request body. Used for POST, PUT, PATCH. |
| `retryLimit` | `number` | no       | 5       | Max retry attempts.                      |
| `timeout`    | `string` | no       | —       | Request timeout.                         |

**Output:**

| Field     | Type     | Description           |
| --------- | -------- | --------------------- |
| `status`  | `number` | HTTP status code      |
| `body`    | `string` | Response body as text |
| `headers` | `object` | Response headers      |

```typescript
// Generated code
const fetch_user_result = await step.do('fetch_user', { retries: { limit: 5 } }, async () => {
  const response = await fetch('https://api.example.com/user', {
    method: 'GET',
    headers: { Authorization: 'Bearer token' },
  })
  return {
    status: response.status,
    body: await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
  }
})
```

---

## sub_workflow

Trigger another AwaitStep workflow, optionally waiting for it to complete before continuing.

| Field               | Type         | Required | Default     | Description                                         |
| ------------------- | ------------ | -------- | ----------- | --------------------------------------------------- |
| `workflowId`        | `string`     | yes      | —           | The ID of the child workflow.                       |
| `workflowName`      | `string`     | yes      | —           | Human-readable name used for the CF binding.        |
| `input`             | `expression` | no       | —           | Expression for params passed to the child workflow. |
| `waitForCompletion` | `boolean`    | no       | `true`      | Block until the child workflow finishes.            |
| `timeout`           | `string`     | no       | `5 minutes` | Max time to wait for child completion.              |

**Output:**

| Field        | Type     | Description                    |
| ------------ | -------- | ------------------------------ |
| `instanceId` | `string` | The child workflow instance ID |

```typescript
// Generated code
const child_result = await step.do('trigger_fulfillment', async () => {
  const instance = await env.ORDER_FULFILLMENT.create({ params: charge_result })
  return { instanceId: instance.id }
})
```
