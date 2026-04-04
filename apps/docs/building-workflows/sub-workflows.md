---
title: Sub-Workflows
---

# Sub-Workflows

The **Sub-Workflow** node spawns a separate deployed workflow as a child of the current one. This lets you compose large workflows from smaller, reusable pieces.

## When to use sub-workflows

- A workflow has grown too large and should be split into logical units.
- The same sequence of steps is reused across multiple parent workflows.
- You want to isolate failure — a failed sub-workflow does not automatically fail the parent.
- A step sequence needs its own retry configuration and versioning lifecycle.

## Configuration

| Field               | Required | Description                                               |
| ------------------- | -------- | --------------------------------------------------------- |
| Workflow Name       | Yes      | The name of the deployed workflow to invoke               |
| Input               | No       | JSON or expression to pass as the child's trigger payload |
| Wait for Completion | Yes      | Whether to pause the parent until the child finishes      |

## Generated code

### With `waitForCompletion: true` (default)

```typescript
// Step 1: Create the child workflow instance
const process_order_instance = await step.do('Create process-order', async () => {
  const instance = await env.PROCESS_ORDER_WORKFLOW.create({
    id: crypto.randomUUID(),
    params: { orderId: fetch_order.id, userId: fetch_order.userId },
  })
  return { instanceId: instance.id }
})

// Step 2: Poll until the child completes
const process_order = await step.do(
  'Await process-order',
  {
    retries: { limit: 60, delay: '5 seconds', backoff: 'linear' },
  },
  async () => {
    const instance = await env.PROCESS_ORDER_WORKFLOW.get(process_order_instance.instanceId)
    const status = await instance.status()
    if (status.status === 'complete') return status.output
    if (status.status === 'errored')
      throw new NonRetryableError(status.error?.message ?? 'Sub-workflow failed')
    throw new Error('Still running')
  },
)
```

The polling step retries up to 60 times with a 5-second linear backoff — giving the child up to 5 minutes to complete. Increase these values for longer-running children.

### With `waitForCompletion: false`

```typescript
const process_order_instance = await step.do('Create process-order', async () => {
  const instance = await env.PROCESS_ORDER_WORKFLOW.create({
    id: crypto.randomUUID(),
    params: { orderId: fetch_order.id },
  })
  return { instanceId: instance.id }
})
```

The parent continues immediately after creating the child instance. Use this for fire-and-forget scenarios.

## Bindings

The sub-workflow's name is converted to a Cloudflare Workflow binding automatically. For a workflow named `process-order`, the binding is `PROCESS_ORDER_WORKFLOW`. AwaitStep detects this binding at deploy time and adds it to the Worker's `wrangler.json`.

:::info
The child workflow must be deployed before the parent is deployed. If the binding is missing (because the child workflow does not exist), the deploy will fail with a binding resolution error.
:::

## Passing data in and out

### Input to the child

Set the **Input** field to a JSON object or an expression:

```json
{
  "orderId": "&#123;&#123;fetch_order.id&#125;&#125;",
  "amount": "&#123;&#123;fetch_order.total&#125;&#125;"
}
```

This is passed as `event.payload` inside the child workflow's `run()` method.

### Output from the child

When `waitForCompletion` is true, the child's final `step.do()` return value becomes the sub-workflow node's output, accessible via expressions in the parent:

```
&#123;&#123;process_order.invoiceId&#125;&#125;
```

## Error handling

By default, if the child workflow errors, the `NonRetryableError` thrown in the polling step propagates to the parent. Wrap the sub-workflow node in a **Try/Catch** node if you want to handle child failures gracefully.
