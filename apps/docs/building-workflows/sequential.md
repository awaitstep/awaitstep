---
title: Sequential Steps
---

# Sequential Steps

The most common workflow pattern is a series of steps that run one after another. Each step receives the outputs of all previous steps via the expression system.

## How it works

Every node on the canvas is compiled to a `flow.step()` call in a provider-neutral `defineWorkflow` module. Steps execute in the order determined by the edges connecting them. If a step throws, execution stops and the provider retries according to the step's retry configuration. On Cloudflare, the adapter wraps the module in a `WorkflowEntrypoint` class. <Badge type="warning" text="Cloudflare Only" />

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
import { defineWorkflow, durableStep } from '#awaitstep/runtime'
import type { Env } from './env.js'

export default defineWorkflow<Env>({
  id: 'my-workflow',
  async run(flow) {
    const env = flow.env
    const event = flow.event
    const step = durableStep(flow)

    const validate_input = await flow.step('validate-input', async () => {
      const userId = event.payload?.userId
      if (!userId) throw new Error('userId is required')
      return { userId, email: `user-${userId}@example.com` }
    })

    await flow.step('send-email', async () => {
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
  },
})
```

## Key points

- Steps execute **serially** — the second step does not start until the first completes.
- The return value of a step is available to all downstream steps as a variable named after the step's node ID.
- If a step fails after exhausting its retries, the workflow halts and the run is marked `errored`.
- You can add as many sequential steps as needed — there is no hard limit.

## Adding retries to a step

Open the step's config drawer and set **Retry Limit**, **Retry Delay**, and optionally **Backoff**.

```typescript
const my_step = await flow.step(
  'my-step',
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
const my_step = await flow.step('read-payload', async () => {
  return { orderId: event.payload?.orderId }
})
```

## Removing a step from Code

In the Code view's **Steps** side bar, open a step's **⋯** menu and choose
**Remove…**. You can also use **Remove** in the step's details, or **Remove
Step…** in the command palette. The removal is saved as one new version.

- The steps before and after it are connected to each other, so
  `A → removed → B` becomes `A → B`. Inside a loop or a branch, the arm keeps
  its label. If the removed step was the first one, the next step becomes the
  first.
- Removing the only step in an arm leaves that arm empty.
- Branches, loops, parallels, try/catch, races and waits can't be removed from
  Code, because their arms need a new place. Remove… says so in a message;
  remove them on the canvas.
- The dialog lists the steps that read the removed step's value, for example
  <code v-pre>{{say_hello.result}}</code> or `inputs.say_hello`. They show an
  error until you change them, and Deploy refuses until then.
- If another step had the same name, its name loses its `_2` suffix. The dialog
  says so, because references to its old name stop working. References to the
  removed step by name then read that step instead, without an error, and the
  dialog lists those separately.
- If you remove the step at the start of an arm (of a branch, loop, wait,
  parallel, race or try/catch), and the step after it is also reached another
  way (a join, or the container's next step), the save is refused. The arm
  would lead straight into that step, which then wouldn't run on the other
  paths. Add a step to that arm first, or change it on the canvas. The canvas
  flags the same shape on the node and refuses to save it.
- Unsaved changes in the removed step's file are discarded, and its tab
  closes.

The canvas removes a node without connecting its neighbours, because there you
can draw the connection yourself.
