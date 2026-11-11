# Built-in Nodes Reference

All 12 built-in nodes are available in every AwaitStep workflow. They cannot be removed or overridden. All support the providers: `cloudflare`, `inngest`, `temporal`, and `stepfunctions`.

---

## step

Run arbitrary TypeScript inside a durable step.

**Config:**

| Field        | Type     | Required | Default       | Description                                                                                                          |
| ------------ | -------- | -------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `code`       | `code`   | yes      | —             | TypeScript to execute. `ctx.attempt` is the current retry count (1-indexed). Return value must be JSON-serializable. |
| `retryLimit` | `number` | no       | `2`           | Max retry attempts. Every step carries this default; Cloudflare's own is 5.                                          |
| `retryDelay` | `string` | no       | `5 seconds`   | Delay between retries (duration format).                                                                             |
| `backoff`    | `select` | no       | `exponential` | Backoff strategy: `exponential`, `linear`, `constant`.                                                               |
| `timeout`    | `string` | no       | —             | Per-attempt timeout (duration format).                                                                               |

**Output:** Defined by the return value of the code field. Shape is whatever the user's code returns.

**Generated code:**

```typescript
const my_step_result = await flow.step(
  'my_step',
  {
    retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
  },
  async () => {
    const response = await fetch('https://api.example.com')
    return { data: await response.json() }
  },
)
```

---

## branch

Conditional routing with multiple outgoing paths. Each outgoing edge carries a condition expression evaluated at runtime.

**Config:** None. Conditions are set as edge labels on the canvas.

**Output:** None (routes to other nodes).

**Generated code:**

```typescript
if (prev_result.status === 200) {
  // success branch nodes...
} else {
  // fallback branch nodes...
}
```

---

## parallel

Run multiple branches concurrently. Execution resumes after all branches complete.

**Config:** None. Branches are the outgoing edges from this node.

**Output:** None.

**Generated code:**

```typescript
await Promise.all([
  (async () => {
    const notify_result = await flow.step('notify', async () => {
      /* ... */
    })
  })(),
  (async () => {
    const log_result = await flow.step('log', async () => {
      /* ... */
    })
  })(),
])
```

---

## loop

Repeat a set of steps using one of three loop modes.

**Config:**

| Field        | Type         | Required | Default   | Description                                |
| ------------ | ------------ | -------- | --------- | ------------------------------------------ |
| `loopType`   | `select`     | yes      | `forEach` | Loop mode: `forEach`, `while`, or `times`. |
| `collection` | `expression` | no       | —         | Array expression for `forEach` mode.       |
| `itemVar`    | `string`     | no       | `item`    | Current item variable name (`forEach`).    |
| `indexVar`   | `string`     | no       | `i`       | Current index variable name (`forEach`).   |
| `condition`  | `expression` | no       | —         | Continue condition for `while` mode.       |
| `count`      | `number`     | no       | `5`       | Iteration count for `times` mode. Min: 1.  |

**Output:**

| Field     | Type    | Description                            |
| --------- | ------- | -------------------------------------- |
| `results` | `array` | Collected results from each iteration. |

**Generated code (forEach):**

```typescript
const loop_results = []
for (const [i, item] of get_users_result.users.entries()) {
  const iter_result = await flow.step(`loop_iter_${i}`, async () => {
    return processUser(item)
  })
  loop_results.push(iter_result)
}
```

---

## break

Exit a loop or stop workflow execution, optionally based on a condition.

**Config:**

| Field       | Type         | Required | Description                                                                   |
| ----------- | ------------ | -------- | ----------------------------------------------------------------------------- |
| `condition` | `expression` | no       | JS expression — breaks only when truthy. Leave empty for unconditional break. |

**Output:** None.

**Generated code:**

```typescript
if (poll_result.status === 'complete') {
  break
}
```

---

## race

Run multiple branches concurrently. The first branch to complete wins; all others are abandoned.

**Config:** None. Branches are the outgoing edges from this node.

**Output:** None.

**Generated code:**

```typescript
await Promise.race([
  (async () => {
    const path_a_result = await flow.step('path_a', async () => {
      /* ... */
    })
  })(),
  (async () => {
    const path_b_result = await flow.step('path_b', async () => {
      /* ... */
    })
  })(),
])
```

---

## try_catch

Wrap a group of steps in try/catch/finally error handling.

**Config:** None. Error handling paths are configured as outgoing edges labeled `try`, `catch`, or `finally`.

**Output:** None.

**Generated code:**

```typescript
try {
  const risky_result = await flow.step('risky_op', async () => {
    /* ... */
  })
} catch (err) {
  const handle_result = await flow.step('handle_error', async () => {
    return { error: err.message }
  })
} finally {
  await flow.step('cleanup', async () => {
    /* ... */
  })
}
```

---

## sleep

Pause execution for a duration. Does not count against the 100-step limit.

**Config:**

| Field      | Type     | Required | Description                                                                |
| ---------- | -------- | -------- | -------------------------------------------------------------------------- |
| `duration` | `string` | yes      | Duration string (e.g. `30 seconds`, `5 minutes`, `2 hours`). Max 365 days. |

**Output:** None.

**Generated code:**

```typescript
await flow.sleep('pause', '5 minutes')
```

---

## sleep_until

Pause execution until a specific timestamp. Does not count against the 100-step limit.

**Config:**

| Field       | Type     | Required | Description                                                                             |
| ----------- | -------- | -------- | --------------------------------------------------------------------------------------- |
| `timestamp` | `string` | yes      | ISO 8601 datetime (e.g. `2025-12-31T09:00:00Z`). Must be at least 1 hour in the future. |

**Output:** None.

**Generated code:**

```typescript
await flow.sleepUntil('wait_until', '2025-12-31T09:00:00Z')
```

---

## wait_for_event

Pause execution until an external event is received via the `sendEvent` API.

**Config:**

| Field       | Type     | Required | Description                                                                                                                                                              |
| ----------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eventType` | `string` | yes      | Event type identifier. Alphanumeric, hyphens, underscores. Max 100 chars.                                                                                                |
| `timeout`   | `string` | yes      | Max time to wait (e.g. `24 hours`, default `365 days`). Max 365 days. Select the **on-event** and **on-timeout** paths; the timeout path runs on `WorkflowTimeoutError`. |

**Output:**

| Field     | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `payload` | `object` | The event payload sent via the `sendEvent` API. |

**Generated code:**

```typescript
const approval_result = await flow
  .waitForEvent('wait_for_approval', {
    type: 'user-approval',
    timeout: '48 hours',
  })
  .catch((err) => {
    if (!isWorkflowTimeoutError(err)) throw err
    return Symbol('timeout')
  })

if (typeof approval_result === 'symbol') {
  // on-timeout path
} else {
  // on-event path
}
```

---

## http_request

Make a durable HTTP API call with configurable retries.

**Config:**

| Field        | Type     | Required | Default | Description                                                                                                                                                                                                      |
| ------------ | -------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`     | `select` | yes      | `GET`   | HTTP method: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.                                                                                                                                         |
| `url`        | `string` | yes      | —       | Request URL. Must be a valid URL.                                                                                                                                                                                |
| `headers`    | `json`   | no       | —       | JSON object of request headers.                                                                                                                                                                                  |
| `body`       | `code`   | no       | —       | Request body as a JS expression. Used for POST, PUT, PATCH. A single object or array literal (`{ id: 1 }`) is sent as JSON with `Content-Type: application/json`; anything else is passed to `fetch` as written. |
| `retryLimit` | `number` | no       | `2`     | Max retry attempts. Min: 0.                                                                                                                                                                                      |
| `timeout`    | `string` | no       | —       | Request timeout (duration format).                                                                                                                                                                               |

**Output:**

| Field     | Type     | Description                   |
| --------- | -------- | ----------------------------- |
| `status`  | `number` | HTTP response status code     |
| `body`    | `string` | Response body as text         |
| `headers` | `object` | Response headers as an object |

**Generated code:**

```typescript
const fetch_data_result = await flow.step(
  'fetch_data',
  {
    retries: { limit: 5, delay: '5 seconds', backoff: 'exponential' },
  },
  async () => {
    const response = await fetch('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ query: 'example' }),
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }
    return {
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    }
  },
)
```

---

## sub_workflow

Call another deployed workflow, optionally waiting for it to complete.

**Config:**

| Field               | Type         | Required | Default     | Description                                                                    |
| ------------------- | ------------ | -------- | ----------- | ------------------------------------------------------------------------------ |
| `workflowId`        | `string`     | yes      | —           | The target workflow's AwaitStep id or deployed name.                           |
| `workflowName`      | `string`     | no       | —           | Provider export name, where the provider has one (Cloudflare: class name).     |
| `input`             | `expression` | no       | —           | Expression for the params passed to the child workflow.                        |
| `waitForCompletion` | `boolean`    | no       | `true`      | If true, blocks until the child workflow finishes.                             |
| `timeout`           | `string`     | no       | `5 minutes` | Max time to wait for child completion (duration format).                       |
| `params`            | `json`       | no       | —           | Provider-scoped settings, e.g. `{ "cf": { "binding": "ORDER_FULFILLMENT" } }`. |

**Output:**

| Field        | Type     | Description                    |
| ------------ | -------- | ------------------------------ |
| `instanceId` | `string` | The child workflow instance ID |

**Generated code:**

```typescript
const order_instance = await flow.step('order--create', () =>
  flow.startWorkflow({
    workflow: 'order-fulfillment',
    exportName: 'OrderFulfillment',
    input: charge_result,
    waitForCompletion: true,
  }),
)

const order = await flow.step(
  'order--await',
  { retries: { limit: 60, delay: '5 seconds', backoff: 'linear' } },
  async () => {
    const status = await flow.workflowStatus(order_instance.instanceId, {
      workflow: 'order-fulfillment',
      exportName: 'OrderFulfillment',
    })
    if (status.status === 'complete') return status.output
    throw new Error('Still running')
  },
)
```

The provider's platform adapter maps those calls to its own primitive. On
Cloudflare, the generated `worker.ts` implements them over the workflow and
service bindings. <Badge type="warning" text="Cloudflare Only" />
