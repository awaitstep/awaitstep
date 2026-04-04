---
title: Timeouts
---

# Timeouts

## `Step exceeded its timeout`

**Error message:** `Error: Step "My Step" exceeded timeout of 30 seconds`

**Cause:** The step's timeout was set too low for the work it needs to do, or the external API it calls is too slow.

**Fix:**

1. Open the node's config drawer.
2. Increase the **Timeout** value (e.g. `2 minutes`, `10 minutes`).
3. Alternatively, investigate why the external API is slow and address the root cause.

Timeout strings accept: `seconds`, `minutes`, `hours` — e.g. `"30 seconds"`, `"5 minutes"`, `"1 hour"`.

---

## `Wait for Event timed out`

**Error message:** `Error: waitForEvent timed out after 72 hours`

**Cause:** A **Wait for Event** node did not receive the expected event within the configured timeout period.

**Fix:**

- Add a **Try/Catch** node around the Wait for Event to handle timeouts gracefully.
- Inside the catch branch, notify relevant parties that no response was received, or take a default action.

```typescript
// Generated code with timeout handling:
try {
  const approval = await step.waitForEvent('Wait for Approval', {
    type: 'approval-decision',
    timeout: '72 hours',
  })
  // success path
} catch (err) {
  // timeout path — auto-reject or escalate
  await step.do('Handle Timeout', async () => {
    // notify requester that approval expired
  })
}
```

---

## `Workflow exceeded maximum duration`

**Cause:** Cloudflare Workflows has a maximum total workflow duration. Workflows that sleep or wait for excessively long periods, or have deeply nested loops, can hit this limit.

**Fix:**

- Break the workflow into smaller sub-workflows with shorter individual lifetimes.
- Reduce sleep durations where possible.
- For very long-running processes (weeks or months), consider triggering a new workflow instance from within the current one before it expires.

---

## `fetch` calls timing out inside steps

**Cause:** The `fetch` call inside a step has no timeout set, and the external API is hanging.

**Fix:** Add an `AbortController` with a timeout to your `fetch` calls inside Step node code:

```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 10_000) // 10 seconds

try {
  const res = await fetch('https://api.example.com/data', {
    signal: controller.signal,
  })
  clearTimeout(timeout)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
} catch (err) {
  clearTimeout(timeout)
  throw err // let the platform retry
}
```

Alternatively, set the step-level **Timeout** in the node config drawer, which causes the platform to abort the entire step if it runs too long.

---

## Retry delay is too long

**Cause:** A step is configured with a long retry delay (e.g. `"1 hour"`) and a high retry limit, causing the workflow to be effectively stuck for many hours.

**Fix:**

- Reduce the retry delay or limit.
- Use exponential backoff to start with short delays and increase only for persistent failures:

```json
{
  "retries": { "limit": 5, "delay": "10 seconds", "backoff": "exponential" }
}
```

With exponential backoff and a 10-second initial delay, the delays are approximately: 10s, 20s, 40s, 80s, 160s — a total wait of about 5 minutes maximum before the step is marked as failed.
