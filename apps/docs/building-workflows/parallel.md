---
title: Parallel & Race
---

# Parallel & Race

## Parallel node

The **Parallel** node runs multiple branches concurrently using `Promise.all`. All branches must complete before execution continues.

### When to use

Use Parallel when you have independent work that does not depend on each other's results — for example, sending an email and a Slack notification at the same time, or fetching data from two separate APIs.

### Adding a parallel node

1. Drag a **Parallel** node onto the canvas.
2. Connect the output of the node to the first step of each branch you want to run concurrently.
3. Optionally connect a merge point after the parallel node to continue after all branches finish.

### Generated code

```typescript
await Promise.all([
  step.do('Send Email', async () => {
    await fetch('https://api.resend.com/emails', {
      /* ... */
    })
  }),
  step.do('Send Slack Message', async () => {
    await fetch('https://slack.com/api/chat.postMessage', {
      /* ... */
    })
  }),
  step.do('Log to Analytics', async () => {
    await fetch('https://api.segment.io/v1/track', {
      /* ... */
    })
  }),
])
```

:::info
Each branch inside a Parallel node runs in the same Cloudflare Workflow instance. They share the same durable execution guarantees — if the workflow is interrupted mid-parallel, only the incomplete branches re-run on resume.
:::

## Race node

The **Race** node runs multiple branches concurrently using `Promise.race`. The first branch to complete wins; all others are abandoned.

### When to use

Use Race when you want to take the fastest result from multiple sources — for example, querying two AI providers and using whichever responds first.

### Generated code

```typescript
const result = await Promise.race([
  step.do('Query Provider A', async () => {
    const res = await fetch('https://api.provider-a.com/generate', {
      /* ... */
    })
    return await res.json()
  }),
  step.do('Query Provider B', async () => {
    const res = await fetch('https://api.provider-b.com/generate', {
      /* ... */
    })
    return await res.json()
  }),
])
```

:::warning
Branches that lose a race are not automatically cancelled — Cloudflare Workflows does not support step cancellation. The losing branches complete their current `step.do()` call before the workflow moves on, but their results are discarded.
:::

## Accessing parallel results

When individual parallel branches need to return values, assign the `Promise.all` call to a variable:

```typescript
const [emailResult, slackResult] = await Promise.all([
  step.do('Send Email', async () => {
    return { messageId: '...' }
  }),
  step.do('Post Slack', async () => {
    return { ts: '...' }
  }),
])
```

In AwaitStep, downstream steps reference the parallel node's output, which contains the combined results array.
