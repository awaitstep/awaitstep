import { Send, Siren, UserCheck, Webhook } from 'lucide-react'
import type { WorkflowTemplate } from './types'
import {
  branch,
  edge,
  http,
  slackMessage,
  step,
  waitEdges,
  waitForEvent,
  workflow,
} from './template-nodes'

const inboundWebhook: WorkflowTemplate = {
  id: 'inbound-webhook',
  name: 'Inbound webhook handler',
  description: 'Check a webhook’s signature, then route it by event type.',
  icon: Webhook,
  category: 'integrations',
  ir: workflow(
    'Inbound webhook handler',
    'Runs on each webhook your trigger receives.',
    [
      step(
        'verify_signature',
        [300, 0],
        `  // Your trigger must send the raw request body and its signature header as the
  // payload; the default trigger parses the body, so add your own fetch handler.
  // TODO: match your provider's signing scheme. This checks a base64 HMAC-SHA256 of
  // the body; Stripe, for one, signs "timestamp.body" in hex (Stripe-Signature header).
  // TODO: reject old timestamps, so a captured request can't be replayed.
  const { rawBody, signature } = event.payload;
  if (!signature || !env.WEBHOOK_SECRET) throw new Error("Missing webhook signature or secret");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
    new TextEncoder().encode(rawBody),
  );
  if (!valid) throw new Error("Invalid webhook signature");
  // TODO: skip events you have already handled (store the id).
  const data = JSON.parse(rawBody);
  return { id: data.id, type: data.type, data };`,
        // A bad signature won't get better on a retry.
        { retryLimit: 0 },
      ),
      branch(
        'route_event',
        [300, 120],
        [
          {
            label: 'user_created',
            condition: '{{verify_signature.type}} === "user.created"',
          },
          { label: 'order_paid', condition: '{{verify_signature.type}} === "order.paid"' },
          { label: 'other', condition: '' },
        ],
      ),
      step(
        'handle_user',
        [100, 240],
        `  // TODO: create the user in your app.
  return { handled: {{verify_signature.id}} };`,
      ),
      step(
        'handle_order',
        [300, 240],
        `  // TODO: mark the order paid in your app.
  return { handled: {{verify_signature.id}} };`,
      ),
      step('ignore_event', [500, 240], '  return { ignored: {{verify_signature.type}} };'),
    ],
    [
      edge('verify_signature', 'route_event'),
      edge('route_event', 'handle_user', 'user_created'),
      edge('route_event', 'handle_order', 'order_paid'),
      edge('route_event', 'ignore_event', 'other'),
    ],
  ),
}

const outboundWebhook: WorkflowTemplate = {
  id: 'outbound-webhook',
  name: 'Outbound webhook delivery',
  description: 'Sign a payload and deliver it to a customer’s URL, retrying with backoff.',
  icon: Send,
  category: 'integrations',
  ir: workflow(
    'Outbound webhook delivery',
    'Delivers one webhook to a customer endpoint.',
    [
      step(
        'sign_payload',
        [300, 0],
        `  const { url, payload } = event.payload;
  // TODO: only deliver to the https URL the customer registered, and sign with that
  // endpoint's own secret: a shared secret lets one customer forge webhooks to another.
  const secret = env.WEBHOOK_SIGNING_SECRET;
  // An id and timestamp in the signature let the receiver reject replays.
  const id = crypto.randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(\`\${id}.\${timestamp}.\${body}\`);
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, signed))));
  return { url, id, timestamp, body, signature };`,
      ),
      http(
        'deliver',
        [300, 120],
        {
          url: '${sign_payload.url}',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'webhook-id': '${sign_payload.id}',
            'webhook-timestamp': '${sign_payload.timestamp}',
            'webhook-signature': 'v1,${sign_payload.signature}',
          },
          body: '{{sign_payload.body}}',
          durable: true,
        },
        {
          retries: { limit: 5, delay: '10 seconds', backoff: 'exponential' },
          timeout: '30 seconds',
        },
      ),
      step(
        'record_delivery',
        [300, 240],
        `  // TODO: save the delivery in your webhook log.
  return { delivered: true, url: {{sign_payload.url}} };`,
      ),
    ],
    [edge('sign_payload', 'deliver'), edge('deliver', 'record_delivery')],
  ),
}

const waitForDecision = waitForEvent('wait_for_decision', [300, 120], {
  eventType: 'approval',
  timeout: '2 days',
  onEvent: 'check_decision',
  onTimeout: 'tell_requester',
})

const approval: WorkflowTemplate = {
  id: 'approval',
  name: 'Approval',
  description:
    'Ask for approval in Slack, then go ahead, reject, or tell the requester it expired.',
  icon: UserCheck,
  category: 'integrations',
  ir: workflow(
    'Approval',
    'Waits for a person to approve a request.',
    [
      slackMessage(
        'ask_for_approval',
        [300, 0],
        '#approvals',
        'Approval needed: {{event.payload.summary}}',
      ),
      waitForDecision,
      branch(
        'check_decision',
        [150, 240],
        [
          { label: 'approved', condition: '{{wait_for_decision.payload.approved}} === true' },
          { label: 'rejected', condition: '' },
        ],
      ),
      slackMessage(
        'tell_requester',
        [450, 240],
        '#approvals',
        'No decision in 2 days: {{event.payload.summary}} has expired.',
      ),
      step(
        'process_request',
        [50, 360],
        `  // TODO: check that whoever approved (payload.approvedBy) may approve this; any
  // "approval" event sent to this run counts as the decision.
  // TODO: do the approved work.
  return { status: "approved", requestId: event.payload.requestId };`,
      ),
      step(
        'handle_rejection',
        [250, 360],
        `  // TODO: tell the requester why it was rejected.
  return { status: "rejected", reason: {{wait_for_decision.payload.reason}} };`,
      ),
    ],
    [
      edge('ask_for_approval', 'wait_for_decision'),
      ...waitEdges(waitForDecision),
      edge('check_decision', 'process_request', 'approved'),
      edge('check_decision', 'handle_rejection', 'rejected'),
    ],
  ),
}

const waitForAck = waitForEvent('wait_for_ack', [300, 120], {
  eventType: 'incident-ack',
  timeout: '15 minutes',
  onEvent: 'record_ack',
  onTimeout: 'escalate',
})

const incidentEscalation: WorkflowTemplate = {
  id: 'incident-escalation',
  name: 'Incident escalation',
  description: 'Alert on-call in Slack, and escalate if nobody acknowledges within 15 minutes.',
  icon: Siren,
  category: 'integrations',
  ir: workflow(
    'Incident escalation',
    'Runs when an alert fires.',
    [
      slackMessage(
        'notify_on_call',
        [300, 0],
        '#on-call',
        '[{{event.payload.severity}}] {{event.payload.service}}: {{event.payload.message}}',
      ),
      waitForAck,
      step(
        'record_ack',
        [150, 240],
        '  return { status: "acknowledged", by: {{wait_for_ack.payload.acknowledgedBy}} };',
      ),
      slackMessage(
        'escalate',
        [450, 240],
        '#incidents',
        'Not acknowledged in 15 minutes: {{event.payload.service}}: {{event.payload.message}}',
      ),
    ],
    [edge('notify_on_call', 'wait_for_ack'), ...waitEdges(waitForAck)],
  ),
}

export const integrationTemplates: WorkflowTemplate[] = [
  inboundWebhook,
  outboundWebhook,
  approval,
  incidentEscalation,
]
