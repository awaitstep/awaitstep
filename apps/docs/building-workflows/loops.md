---
title: Loops
---

# Loops

The **Loop** node repeats a sequence of steps. Three loop types are supported: `forEach`, `while`, and `times`.

## Loop types

### forEach

Iterates over a collection. The collection can be a literal array or an expression referencing an upstream step's output.

| Field         | Description                                  | Example                |
| ------------- | -------------------------------------------- | ---------------------- |
| Collection    | JavaScript expression evaluating to an array | `fetch_orders.results` |
| Item variable | Name for each item inside the loop           | `order`                |

**Generated code:**

```typescript
const process_orders = await step.do('Process Orders', async () => {
  let _output
  let _loop_i = 0
  for (const order of fetch_orders.results) {
    const send_confirmation = await step.do(`Send Confirmation [${_loop_i}]`, async () => {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        body: JSON.stringify({ to: order.email, subject: 'Order confirmed' }),
      })
    })
    _loop_i++
  }
  return _output
})
```

:::info
Step names inside a loop are automatically suffixed with `[0]`, `[1]`, etc. to keep each iteration's step name unique. Cloudflare Workflows requires unique step names within an instance.
:::

### while

Repeats while a condition is true.

| Field     | Description           | Example                             |
| --------- | --------------------- | ----------------------------------- |
| Condition | JavaScript expression | `poll_status.status !== "complete"` |

**Generated code:**

```typescript
const poll_loop = await step.do('Poll Until Complete', async () => {
  let _output
  let _loop_i = 0
  while (poll_status.status !== 'complete') {
    const check = await step.do(`Check Status [${_loop_i}]`, async () => {
      // check status
    })
    _loop_i++
  }
  return _output
})
```

:::warning
A `while` loop with a condition that never becomes false will run indefinitely. Always ensure the loop body mutates state that the condition depends on, or set a maximum iteration count using a counter inside a Step node.
:::

### times

Repeats a fixed number of times.

| Field | Description          | Example |
| ----- | -------------------- | ------- |
| Count | Number of iterations | `5`     |

**Generated code:**

```typescript
const retry_loop = await step.do('Retry 3 Times', async () => {
  let _output
  for (let _loop_i = 0; _loop_i < 3; _loop_i++) {
    const attempt = await step.do(`Attempt [${_loop_i}]`, async () => {
      // attempt logic
    })
  }
  return _output
})
```

## Returning a value from a loop

Assign to the `_output` variable inside any step in the loop body. The last value assigned to `_output` becomes the loop node's return value, which is then accessible to downstream steps.

```typescript
// Inside a Step node in the loop body:
_output = { processedCount: _loop_i + 1, lastItem: order }
```

## Break node

The **Break** node exits the innermost loop immediately. Place it inside a Branch node within the loop body to conditionally stop iteration.

```typescript
// Generated from a Branch + Break inside a loop:
if (check.status === 'complete') {
  break
}
```

:::tip
Use Break inside a `while` loop when you need to exit based on a complex condition computed inside the loop body, rather than in the loop condition expression itself.
:::
