---
title: Sequential Steps
---

# Sequential Steps

The most common workflow pattern is a series of steps that run one after another. Each step receives the outputs of all previous steps via the expression system.

## How it works

Every node on the canvas is compiled to a `step.do()` call inside a Cloudflare `WorkflowEntrypoint`. Steps execute in the order determined by the edges connecting them. If a step throws, execution stops and the platform retries according to the step's retry configuration.

## Example: Validate and send email

The workflow below has two steps:

1. **Validate Input** — checks that a user ID was provided
2. **Send Email** — uses the result from step 1 to send a confirmation

### Canvas nodes

| Order | Node name      | Node type          | Key config                                      |
| ----- | -------------- | ------------------ | ----------------------------------------------- |
| 1     | Validate Input | Step               | Custom TypeScript                               |
| 2     | Send Email     | Resend: Send Email | to: <code v-pre>{{validate_input.email}}</code> |

### Generated TypeScript

```typescript
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers'

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const validate_input = await step.do('Validate Input', async () => {
      const userId = event.payload?.userId
      if (!userId) throw new Error('userId is required')
      return { userId, email: `user-${userId}@example.com` }
    })

    await step.do('Send Email', async () => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@example.com',
          to: validate_input.email,
          subject: 'Welcome',
          text: `Hello user ${validate_input.userId}`,
        }),
      })
      if (!res.ok) throw new Error(`Resend error: ${res.status}`)
    })
  }
}
```

## Key points

- Steps execute **serially** — the second step does not start until the first completes.
- The return value of a step is available to all downstream steps as a variable named after the step's node ID.
- If a step fails after exhausting its retries, the workflow halts and the run is marked `errored`.
- You can add as many sequential steps as needed — there is no hard limit.

## Adding retries to a step

Open the step's config drawer and set **Retry Limit**, **Retry Delay**, and optionally **Backoff**.

```typescript
const my_step = await step.do(
  'My Step',
  {
    retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
  },
  async () => {
    // ...
  },
)
```

## Accessing trigger payload

The trigger payload is available on `event.payload` inside any step:

```typescript
const my_step = await step.do('Read Payload', async () => {
  return { orderId: event.payload?.orderId }
})
```
