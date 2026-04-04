---
title: Triggering Runs via API
---

# Triggering Runs via API

The trigger endpoint starts a new execution of a deployed workflow. The workflow must be deployed before it can be triggered.

## Endpoint

```
POST /api/workflows/:workflowId/trigger
```

**Required scope:** `deploy`

## Request

| Field          | Type   | Required | Description                                                          |
| -------------- | ------ | -------- | -------------------------------------------------------------------- |
| `connectionId` | string | Yes      | The Cloudflare connection to trigger against                         |
| `params`       | object | No       | Payload passed to the workflow as `event.payload`. Capped at 100 KB. |

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/wf_abc123/trigger \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "conn_xyz789",
    "params": {
      "orderId": "ord_001",
      "userId": "usr_42",
      "amount": 4999
    }
  }'
```

## Response

```json
{
  "instanceId": "9d3f1a2b-4c5e-6d7f-8a9b-0c1d2e3f4a5b"
}
```

The `instanceId` is the Cloudflare Workflow instance ID. Use it to poll status.

## JavaScript example

```javascript
const response = await fetch('https://app.awaitstep.dev/api/workflows/wf_abc123/trigger', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ask_yourkey',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    connectionId: 'conn_xyz789',
    params: { orderId: 'ord_001' },
  }),
})

const { instanceId } = await response.json()
console.log('Run started:', instanceId)
```

## Polling run status

After triggering, poll the run endpoint to check status.

### Endpoint

```
GET /api/workflows/:workflowId/runs/:runId
```

**Required scope:** `read`

### Run states

| State        | Description                                     |
| ------------ | ----------------------------------------------- |
| `queued`     | Instance created, not yet started               |
| `running`    | Currently executing                             |
| `paused`     | Paused by a `step.waitForEvent` or manual pause |
| `complete`   | Finished successfully                           |
| `errored`    | Failed after exhausting retries                 |
| `terminated` | Manually terminated                             |

### Polling example

```javascript
async function waitForCompletion(workflowId, runId, apiKey, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`https://app.awaitstep.dev/api/workflows/${workflowId}/runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const run = await res.json()

    if (run.status === 'complete') return run
    if (run.status === 'errored') throw new Error(`Run failed: ${run.error}`)
    if (run.status === 'terminated') throw new Error('Run was terminated')

    // Wait 2 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('Timed out waiting for run to complete')
}
```

## Sending events to a waiting run

If the workflow contains a **Wait for Event** node, it pauses and waits for an event to be delivered. Send the event via the trigger endpoint with the instance ID in the params:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/wf_abc123/trigger \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "conn_xyz789",
    "params": {
      "instanceId": "9d3f1a2b-4c5e-6d7f-8a9b-0c1d2e3f4a5b",
      "eventType": "approval-decision",
      "payload": {
        "approved": true,
        "comments": "Looks good"
      }
    }
  }'
```

The `instanceId`, `eventType`, and `payload` fields are routed by the Worker's trigger code to the correct waiting instance.

## Run control

| Action    | Endpoint                                    | Scope    |
| --------- | ------------------------------------------- | -------- |
| Pause     | `POST /workflows/:id/runs/:runId/pause`     | `deploy` |
| Resume    | `POST /workflows/:id/runs/:runId/resume`    | `deploy` |
| Terminate | `POST /workflows/:id/runs/:runId/terminate` | `deploy` |
