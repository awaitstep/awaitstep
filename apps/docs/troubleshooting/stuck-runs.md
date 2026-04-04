---
title: Stuck Runs
---

# Stuck Runs

## Run stays in `running` state indefinitely

**Cause:** The workflow is waiting on a long-running step (network call, external API), or a step is caught in an infinite retry loop.

**Fix:**

1. Open the run detail view — the step currently executing is highlighted.
2. If a step has been retrying for an unexpected amount of time, check the external API it is calling.
3. If the step is genuinely stuck, terminate the run:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/<id>/runs/<runId>/terminate \
  -H "Authorization: Bearer ask_yourkey"
```

---

## Run stays in `paused` state

**Cause:** The workflow reached a **Wait for Event** node and is waiting for an external event that has not been delivered yet.

**Fix:**
This is the expected behaviour. The run is durably paused and will resume when the event arrives. If the run should not be waiting, check:

1. Was the event sent to the correct instance ID?
2. Was the `eventType` in the event payload exactly the same string as configured in the Wait for Event node?
3. Did the event delivery API call succeed? Check for HTTP errors in the response.

To unblock the run by sending a test event:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/<id>/trigger \
  -H "Authorization: Bearer ask_yourkey" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "<conn-id>",
    "params": {
      "instanceId": "<run-id>",
      "eventType": "your-event-type",
      "payload": { "approved": true }
    }
  }'
```

If the run has been waiting longer than the configured timeout, it will have already errored with a timeout exception. Check the run's status.

---

## Run is `paused` but I did not pause it

**Cause:** The run was manually paused via the UI or API, or a `step.sleep` / `step.sleepUntil` is active.

**Fix:**

- If sleeping, the run will resume automatically when the sleep expires.
- If manually paused, resume it:

```bash
curl -X POST https://app.awaitstep.dev/api/workflows/<id>/runs/<runId>/resume \
  -H "Authorization: Bearer ask_yourkey"
```

---

## Run shows `queued` but never starts

**Cause:** The workflow instance was created in Cloudflare but the workflow runtime has not picked it up yet. This can happen if:

- The Worker was recently deployed and Cloudflare has not propagated it globally yet.
- The Cloudflare account is under heavy load.

**Fix:** Wait 30–60 seconds and refresh. If the run is still queued after several minutes:

1. Check the Cloudflare dashboard → Workers & Pages → your Worker → Workflows to see if instances are listed there.
2. Try triggering a new run to see if it starts.
3. If the Worker does not exist in Cloudflare, the deploy may have failed silently — redeploy.

---

## Run completes but shows no step outputs

**Cause:** Steps did not return a value, or the run detail view is displaying a cached version.

**Fix:**

- Refresh the run detail page.
- Check that your Step node code contains a `return` statement. Steps that do not return a value have no recorded output.
- If using the API, fetch the run again — the first response may have been cached before the run completed.
