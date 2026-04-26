---
title: Webhooks
---

# Webhooks

## Outgoing webhooks

AwaitStep does not currently send outgoing webhooks from the platform itself. There are no callbacks or webhook subscriptions for run lifecycle events (started, completed, errored, etc.).

If you need to be notified when a run finishes, you have two options:

- **Poll the run endpoint** — see [Triggering Runs via API](./triggers.md) for a polling example.
- **Add a final step to your workflow** — place an HTTP Request node at the end of your workflow that POSTs to your endpoint. This is the recommended approach.

### Notify your server on completion

Add an **HTTP Request** node as the last step in your workflow:

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Method  | `POST`                                                                |
| URL     | `https://your-server.example.com/webhooks/workflow-complete`          |
| Headers | <code v-pre>{"Authorization": "Bearer {{env.WEBHOOK_SECRET}}"}</code> |
| Body    | `{"workflowId": "...", "status": "complete"}`                         |

This gives you full control over the payload and authentication.

## Incoming webhooks

Every deployed workflow automatically gets a public Cloudflare Worker URL. The generated Worker includes a `fetch` handler that accepts POST requests and creates a workflow instance — making every workflow a webhook endpoint out of the box.

### How it works

1. Deploy your workflow.
2. Copy the Worker URL from the deployment details (e.g. `https://awaitstep-worker-my-workflow.your-account.workers.dev`).
3. Register that URL as a webhook endpoint in the sending service (GitHub, Stripe, Shopify, etc.).

When the service sends a POST request, the Worker parses the JSON body, creates a new workflow instance with that data as params, and responds immediately with the instance ID.

### Customising the trigger code

The default trigger code creates an instance for any POST request. You can customise it in the canvas editor panel under the **Entry** tab (click **Editor** in the toolbar, then select the **Entry** tab) to:

- Validate a signature before accepting the webhook
- Extract specific fields from the request body
- Filter out event types you don't care about

### Responding quickly

Cloudflare Workers must respond within the Worker execution timeout. The default trigger code creates a workflow instance and responds in milliseconds — the actual workflow processing happens asynchronously in the Workflow runtime.

:::tip
For sending services that require a `200 OK` within a strict time window (e.g. Stripe, which times out after 30 seconds), the async Workflow model is ideal. Respond immediately, process durably.
:::

## REST API trigger as an alternative

If you prefer programmatic control over when a workflow starts, use the REST API trigger endpoint instead of an HTTP trigger. See [Triggering Runs via API](./triggers.md).
