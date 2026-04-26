---
title: Sleep, Sleep Until & Wait for Event
---

# Sleep, Sleep Until & Wait for Event

Durable pausing is one of the most powerful features of Cloudflare Workflows. A workflow can sleep for days or weeks without consuming compute resources. When the sleep expires, execution resumes exactly where it left off.

## Sleep

The **Sleep** node pauses execution for a fixed duration.

### Configuration

| Field    | Type              | Example                                        |
| -------- | ----------------- | ---------------------------------------------- |
| Duration | string (duration) | `30 seconds`, `5 minutes`, `2 hours`, `7 days` |

### Generated code

```typescript
await step.sleep('Wait 24 hours', '24 hours')
```

Duration strings accept: `seconds`, `minutes`, `hours`, `days`.

## Sleep Until

The **Sleep Until** node pauses until a specific timestamp.

### Configuration

| Field     | Type              | Example                |
| --------- | ----------------- | ---------------------- |
| Timestamp | string (ISO 8601) | `2026-01-15T09:00:00Z` |

The timestamp can be a static value or an expression referencing an upstream step output:

```
{{parse_schedule.scheduledAt}}
```

### Generated code

```typescript
await step.sleepUntil('Wait until scheduled', new Date('2026-01-15T09:00:00Z'))
```

:::tip
Use an upstream Step node to compute the target date dynamically. For example, calculate "3 days from now" and return it as an ISO string, then reference it in Sleep Until.
:::

## Wait for Event

The **Wait for Event** node pauses execution until an external event is delivered to the workflow instance. This is the primary mechanism for human-in-the-loop flows.

### Configuration

| Field      | Type              | Required | Description                            |
| ---------- | ----------------- | -------- | -------------------------------------- |
| Event Type | string            | Yes      | Identifier for the event to wait for   |
| Timeout    | string (duration) | No       | Maximum time to wait before timing out |

### Generated code

```typescript
const approval_gate = await step.waitForEvent('Wait for approval', {
  type: 'approval-decision',
  timeout: '72 hours',
})
```

The event payload is returned as the step result. Downstream steps can reference `approval_gate.approved`, `approval_gate.comments`, etc.

### Sending events to a waiting workflow

Use the trigger endpoint or the Cloudflare Workflows API to deliver an event to a specific instance:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/<id>/trigger \
  -H "Authorization: Bearer ask_..." \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "<connection-id>",
    "params": {
      "instanceId": "<run-id>",
      "eventType": "approval-decision",
      "payload": { "approved": true, "comments": "Looks good" }
    }
  }'
```

:::info
If the timeout expires before an event arrives, `step.waitForEvent` throws a timeout error. Use a Try/Catch node to handle this case gracefully.
:::

## Durability guarantees

All three pause primitives are fully durable. If the Cloudflare Worker is evicted or the region experiences an outage while a workflow is paused, the workflow automatically resumes when execution is next scheduled. No state is lost.
