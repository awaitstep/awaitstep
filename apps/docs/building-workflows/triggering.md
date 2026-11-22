---
title: Triggering Workflows
---

# Triggering Workflows

A workflow can be started in three ways: manually from the UI, via the REST API, or by an incoming HTTP request.

## Manual trigger

From the **Runs** tab of any deployed workflow, click **Trigger**. A dialog lets you supply an optional JSON payload. Click **Run** to start the workflow.

Manual triggers are useful for testing and one-off executions.

## API trigger

Use the REST API to trigger a workflow programmatically.

### Endpoint

```
POST /api/workflows/:id/trigger
```

**Required scope:** `deploy`

### curl example

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/wf_abc123/trigger \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "conn_xyz",
    "params": {
      "orderId": "ord_001",
      "userId": "usr_42"
    }
  }'
```

The response includes the `instanceId` of the created run:

```json
{ "instanceId": "wf-instance-uuid" }
```

### Polling run status

```bash
curl https://app.awaitstep.dev/api/workflows/wf_abc123/runs/wf-instance-uuid \
  -H "Authorization: Bearer ask_yourkey"
```

See [Triggers API](../api/triggers.md) for full details.

## HTTP trigger (Worker URL)

A deployed workflow's Worker has a `fetch` handler that accepts HTTP requests and creates workflow instances. It is reached at a URL of its own once you give it one: a [custom route or domain](./custom-routes.md), or `workers.dev` turned on in the deployment settings (off by default for workflows).

Runs started from AwaitStep (Trigger, Run again and `POST /api/run/:workflowId`) go through that handler when the deploy has such a URL, so your own checks run first. AwaitStep names the run's instance in an `X-AwaitStep-Instance-Id` header, and the first instance the request creates takes it — through `startWorkflow` or `env.WORKFLOW.create` — so the run shows up in Runs. Without a URL, AwaitStep starts runs through Cloudflare's API and the handler is skipped.

You can also serve workflows from your own domain using [Custom Routes](./custom-routes.md).

### Default trigger code

The generated Worker's `fetch` handler:

A new workflow's `handlers/fetch.ts`:

```typescript
import { startWorkflow, workflowStatus } from '#awaitstep/workflow'
import type { FetchContext } from '#awaitstep/runtime'

// HTTP entry: POST starts a workflow instance, GET ?instanceId= reports its status.
export default async function ({ request, env }: FetchContext<Env>): Promise<Response> {
  try {
    const url = new URL(request.url)

    if (request.method === 'POST') {
      const params = await request.json().catch(() => undefined)
      return Response.json(await startWorkflow(env, params))
    }

    const instanceId = url.searchParams.get('instanceId')
    if (instanceId) {
      const status = await workflowStatus(env, instanceId)
      if (!status) {
        return Response.json({ message: 'Instance not found' }, { status: 404 })
      }
      return Response.json(status)
    }

    return new Response(null, { status: 200 })
  } catch (error) {
    return Response.json({ message: error.message }, { status: 500 })
  }
}
```

A body `instanceId` names the instance (`startWorkflow` takes `params.instanceId`, or `{ instanceId }` as its third argument).

You can customise this code in `handlers/fetch.ts`: click **Code** in the canvas toolbar and create the file under **Project** (the New file dialog accepts the path). It is a plain module whose default export receives `request`, `env`, and `ctx`; ⌘S saves it, and the next deploy wires it into the Worker. Queue consumers live in `handlers/queue/<queue>.ts` and the cron handler in `handlers/scheduled.ts`; the schedules themselves stay on the workflow's trigger and the deployment config.

### Incoming webhook example

```bash
# Trigger the workflow
curl -X POST https://<your-worker>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{ "event": "order.created", "orderId": "ord_001" }'

# { "instanceId": "abc-123-def" }

# Check status
curl "https://<your-worker>.workers.dev?instanceId=abc-123-def"
```

:::tip
To secure the HTTP trigger, add signature verification inside the trigger code. Check an `X-Signature` header using `crypto.subtle` before creating the workflow instance.
:::
