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
Step…** in the command palette. The step disappears at once, but nothing is
saved until you save (see [Changes in Code wait for Save](#changes-in-code-wait-for-save)).

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
  closes. Discarding the removal brings them back.

The canvas removes a node without connecting its neighbours, because there you
can draw the connection yourself.

## Changes in Code wait for Save

In Code, adding a step or a custom node, removing one, saving a node's fields
in its details, and creating, renaming or deleting a file in the Explorer all
wait for Save, like your code edits:

- The change shows at once in the Steps list, the details, the map and the
  step files. A new step's file opens as a new, unsaved file.
- **Unsaved changes** lists each one in plain words: under **Graph**, such as
  Added “fetch user” or Changed retries on “charge”, and under **Files**, such
  as Created lib/helpers.ts or Renamed a.ts → b.ts. Each has its own
  **Discard**. ⌘Z in the Steps list discards the last graph change.
- A file name a rename or delete has freed can't be used again until you save.
- **Save all** (⌘⌥S) saves every change. ⌘S saves the file in front of you
  (a new or renamed file included); on a step's file it also saves every
  graph change.
- If the save is refused (for example, an arm leading straight into a join),
  a message gives the reason and your changes stay.
- If the canvas saved the workflow meanwhile, your changes are replayed on
  its version. One that no longer applies (its step is gone) is discarded and
  named in the notice. The rest stay, so save again.
- Leaving Code, switching to the canvas or another version, or closing the tab
  asks first. Graph and file changes are never kept across a reload; text you
  typed in a renamed or deleted file comes back in that file.
