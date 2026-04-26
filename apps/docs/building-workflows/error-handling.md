---
title: Error Handling
---

# Error Handling

## How errors work by default

When a step throws an error, the platform retries it automatically according to its retry configuration. After exhausting all retries, the error propagates up the call stack. If it reaches the top-level `run()` method, the workflow run is marked `errored` and halted.

## Configuring retries on a step

Open any node's config drawer and set the retry fields:

| Field       | Default      | Description                            |
| ----------- | ------------ | -------------------------------------- |
| Retry Limit | 5            | Maximum number of retry attempts       |
| Retry Delay | `10 seconds` | Delay between retries                  |
| Backoff     | `constant`   | `constant`, `linear`, or `exponential` |
| Timeout     | —            | Max duration for a single attempt      |

### Generated retry config

```typescript
const fetch_data = await step.do(
  'Fetch Data',
  {
    retries: {
      limit: 3,
      delay: '5 seconds',
      backoff: 'exponential',
    },
    timeout: '30 seconds',
  },
  async () => {
    const res = await fetch('https://api.example.com/data')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  },
)
```

## Try/Catch node

The **Try/Catch** node wraps a set of steps in a `try/catch/finally` block. Use it when you want to handle errors without stopping the entire workflow.

### Structure

| Branch  | Description                                             |
| ------- | ------------------------------------------------------- |
| try     | Steps to attempt                                        |
| catch   | Steps to run if any step in the try branch throws       |
| finally | Steps that always run, regardless of success or failure |

### Generated code

```typescript
try {
  const charge = await step.do('Charge Card', async () => {
    // ...
  })
  await step.do('Send Receipt', async () => {
    // ...
  })
} catch (err) {
  await step.do('Refund and Notify', async () => {
    // log the error, notify ops team, etc.
  })
} finally {
  await step.do('Release Lock', async () => {
    // always clean up
  })
}
```

:::tip
The `err` variable inside the catch branch is available as `err.message` in expressions. Reference it with <code v-pre>{{try_catch_node.error}}</code> — the exact path depends on what the catch step returns.
:::

## NonRetryableError

Some errors should not be retried — for example, a 400 Bad Request from an API means the request itself is invalid and retrying will not help. Throw `NonRetryableError` to skip all remaining retry attempts and fail immediately.

```typescript
import { NonRetryableError } from 'cloudflare:workers'

const result = await step.do('Call API', async () => {
  const res = await fetch('https://api.example.com/submit', {
    method: 'POST',
    body: JSON.stringify({ data }),
  })

  if (res.status === 400) {
    const body = await res.json()
    throw new NonRetryableError(`Invalid request: ${body.message}`)
  }

  if (!res.ok) {
    // 5xx errors: retryable
    throw new Error(`Server error: ${res.status}`)
  }

  return await res.json()
})
```

:::warning
`NonRetryableError` must be imported from `cloudflare:workers`. It is available inside any Step node's code editor — the import is injected automatically by the code generator.
:::

## Error propagation summary

| Scenario                        | Behavior                                                  |
| ------------------------------- | --------------------------------------------------------- |
| Step throws a retryable error   | Platform retries up to the retry limit                    |
| Step throws `NonRetryableError` | Fails immediately, no retries                             |
| Step exhausts retries           | Error propagates to parent (Try/Catch or top level)       |
| Try/Catch catch branch throws   | Error propagates to the next outer Try/Catch or top level |
| Uncaught error at top level     | Run is marked `errored`                                   |
