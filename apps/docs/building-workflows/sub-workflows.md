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

| Field               | Required | Description                                                                                   |
| ------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Script Name         | Yes      | The deployed worker name of the child workflow (e.g. `awaitstep-abc123` or `my-order-worker`) |
| Class Name          | Yes      | The exported workflow class name in the child worker (e.g. `OrderFulfillment`)                |
| Input               | No       | Expression to pass as the child's trigger payload                                             |
| Wait for Completion | Yes      | Whether to pause the parent until the child finishes                                          |

### Script Name

This is the **Worker script name** where the child workflow is deployed. For workflows managed by AwaitStep, copy the worker name from the Cloudflare dashboard or from the deployment details (e.g. `awaitstep-jaegvout2dqdgioi4tuvg`). For external workflows not managed by AwaitStep, use whatever name you deployed the worker as (e.g. `my-order-worker`).

### Class Name

This is the **exported class name** of the workflow in the child worker's source code. For example, if the child workflow exports `class OrderFulfillment extends WorkflowEntrypoint`, enter `OrderFulfillment`.

The class name is used to derive the Cloudflare binding fields:

| Derived field | Example                  |
| ------------- | ------------------------ |
| `binding`     | `ORDER_FULFILLMENT`      |
| `name`        | `Order-Fulfillment`      |
| `class_name`  | `OrderFulfillment`       |
| `script_name` | (your Script Name value) |

## Generated code

### With `waitForCompletion: true` (default)

```typescript
// Step 1: Create the child workflow instance
const process_order_instance = await step.do('Create OrderFulfillment', async () => {
  const instance = await env.ORDER_FULFILLMENT.create({
    id: crypto.randomUUID(),
    params: { orderId: fetch_order.id, userId: fetch_order.userId },
  })
  return { instanceId: instance.id }
})

// Step 2: Poll until the child completes
const process_order = await step.do(
  'Await OrderFulfillment',
  {
    retries: { limit: 60, delay: '5 seconds', backoff: 'linear' },
  },
  async () => {
    const instance = await env.ORDER_FULFILLMENT.get(process_order_instance.instanceId)
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
const process_order_instance = await step.do('Create OrderFulfillment', async () => {
  const instance = await env.ORDER_FULFILLMENT.create({
    id: crypto.randomUUID(),
    params: { orderId: fetch_order.id },
  })
  return { instanceId: instance.id }
})
```

The parent continues immediately after creating the child instance. Use this for fire-and-forget scenarios.

## Wrangler bindings

AwaitStep automatically generates the full Cloudflare Workflow binding in `wrangler.json` at deploy time. For a sub-workflow with class name `OrderFulfillment` and script name `awaitstep-abc123`, the generated binding is:

```json
{
  "workflows": [
    { "binding": "WORKFLOW", "name": "parent-workflow", "class_name": "ParentWorkflow" },
    {
      "binding": "ORDER_FULFILLMENT",
      "name": "Order-Fulfillment",
      "class_name": "OrderFulfillment",
      "script_name": "awaitstep-abc123"
    }
  ]
}
```

:::info
The child workflow must be deployed before the parent is deployed. If the binding cannot be resolved (because the child worker does not exist), the deploy will fail.
:::

## Passing data in and out

### Input to the child

Set the **Input** field to an expression:

```javascript
{ orderId: fetch_order.id, amount: fetch_order.total }
```

This is passed as `event.payload` inside the child workflow's `run()` method.

### Output from the child

When `waitForCompletion` is true, the child's final `step.do()` return value becomes the sub-workflow node's output, accessible via expressions in the parent:

```
{{process_order.invoiceId}}
```

## Error handling

By default, if the child workflow errors, the `NonRetryableError` thrown in the polling step propagates to the parent. Wrap the sub-workflow node in a **Try/Catch** node if you want to handle child failures gracefully.
