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

| Field               | Required | Description                                                                    |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| Workflow            | Yes      | The target workflow's AwaitStep id or deployed name.                           |
| Export name         | No       | Provider export name, where the provider has one (Cloudflare: class name).     |
| Input               | No       | Expression to pass as the child's trigger payload.                             |
| Wait for Completion | Yes      | Whether to pause the parent until the child finishes.                          |
| Provider params     | No       | Provider-scoped settings, e.g. `{ "cf": { "binding": "ORDER_FULFILLMENT" } }`. |

The node is provider-neutral. The generated code calls the runtime's platform
adapter (`flow.startWorkflow`, `flow.workflowStatus`); the provider decides how
to start the child and read its status.

### Cloudflare specifics

On Cloudflare the adapter derives a workflow binding from the **export name**
(`OrderFulfillment` → `ORDER_FULFILLMENT`) unless `params.cf.binding` names it
explicitly. The child must be deployed before the parent.

## Generated code

### With `waitForCompletion: true` (default)

```typescript
const order_instance = await flow.step('order--create', () =>
  flow.startWorkflow({
    workflow: 'order-fulfillment',
    exportName: 'OrderFulfillment',
    input: { orderId: fetch_order.id, userId: fetch_order.userId },
    waitForCompletion: true,
    timeout: '5 minutes',
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
    if (status.status === 'complete' || status.status === 'succeeded') return status.output
    if (status.status === 'errored') throw new Error(status.error?.message ?? 'Sub-workflow failed')
    throw new Error('Still running')
  },
)
```

The polling step retries up to 60 times with a 5-second linear backoff — giving
the child up to 5 minutes to complete. Increase these values for longer-running
children. A provider adapter may throw a non-retryable error for a terminal
failure, so a failed child is not polled again.

### With `waitForCompletion: false`

```typescript
const order_instance = await flow.step('order--create', () =>
  flow.startWorkflow({
    workflow: 'order-fulfillment',
    exportName: 'OrderFulfillment',
    input: { orderId: fetch_order.id },
    waitForCompletion: false,
  }),
)
```

The parent continues immediately after creating the child instance. Use this for
fire-and-forget scenarios.

## Wrangler bindings <Badge type="warning" text="Cloudflare Only" />

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
