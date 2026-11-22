import type { WorkflowTemplate } from './types.js'
import {
  edge,
  http,
  loopEach,
  sendEmail,
  slackMessage,
  step,
  waitEdges,
  waitForEvent,
  workflow,
} from './template-nodes.js'

const waitForPayment = waitForEvent('wait_for_payment', [300, 240], {
  eventType: 'payment-succeeded',
  timeout: '3 days',
  onEvent: 'payment_recovered',
  onTimeout: 'downgrade_account',
})

const failedPayment: WorkflowTemplate = {
  id: 'failed-payment-recovery',
  name: 'Failed payment recovery',
  description: 'Email the customer, then downgrade if they don’t pay in 3 days.',
  icon: 'credit-card',
  category: 'billing',
  ir: workflow(
    'Failed payment recovery',
    'Runs on Stripe’s invoice.payment_failed event.',
    [
      step(
        'read_invoice',
        [300, 0],
        `  // TODO: check the Stripe-Signature header in your trigger before you start this
  // workflow; anyone can post a fake event to a public URL. See "Inbound webhook handler".
  // The Stripe invoice.payment_failed event, sent as the payload.
  const invoice = event.payload.data.object;
  return {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    email: invoice.customer_email,
  };`,
      ),
      sendEmail('email_customer', [300, 120], {
        to: '{{read_invoice.email}}',
        subject: 'Your payment didn’t go through',
        html: '<p>Please update your card to keep your subscription.</p>',
      }),
      waitForPayment,
      step(
        'payment_recovered',
        [150, 360],
        '  return { status: "recovered", invoiceId: {{read_invoice.invoiceId}} };',
      ),
      step(
        'downgrade_account',
        [450, 360],
        `  // TODO: downgrade or pause the customer's account in your app.
  return { status: "downgraded", customerId: {{read_invoice.customerId}} };`,
      ),
    ],
    [
      edge('read_invoice', 'email_customer'),
      edge('email_customer', 'wait_for_payment'),
      ...waitEdges(waitForPayment),
    ],
  ),
}

const waitForSubscription = waitForEvent('wait_for_subscription', [300, 240], {
  eventType: 'subscribed',
  timeout: '3 days',
  onEvent: 'trial_converted',
  onTimeout: 'end_trial',
})

const trialEnding: WorkflowTemplate = {
  id: 'trial-ending',
  name: 'Trial ending',
  description: 'Remind the customer 3 days out, then end the trial if they don’t subscribe.',
  icon: 'hourglass',
  category: 'billing',
  ir: workflow(
    'Trial ending',
    'Runs on Stripe’s customer.subscription.trial_will_end event.',
    [
      step(
        'read_trial',
        [300, 0],
        `  // Stripe sends trial_will_end 3 days before the trial ends.
  // TODO: check the Stripe-Signature header in your trigger before you start this
  // workflow; anyone can post a fake event to a public URL. See "Inbound webhook handler".
  const subscription = event.payload.data.object;
  // TODO: look up the customer's email; the event only carries their id.
  const email = "customer@example.com";
  return { subscriptionId: subscription.id, customerId: subscription.customer, email };`,
      ),
      sendEmail('send_reminder', [300, 120], {
        to: '{{read_trial.email}}',
        subject: 'Your trial ends in 3 days',
        html: '<p>Pick a plan to keep your workspace.</p>',
      }),
      waitForSubscription,
      step(
        'trial_converted',
        [150, 360],
        '  return { status: "subscribed", subscriptionId: {{read_trial.subscriptionId}} };',
      ),
      step(
        'end_trial',
        [450, 360],
        `  // TODO: move the account to your free plan or lock it.
  return { status: "trial-ended", customerId: {{read_trial.customerId}} };`,
      ),
    ],
    [
      edge('read_trial', 'send_reminder'),
      edge('send_reminder', 'wait_for_subscription'),
      ...waitEdges(waitForSubscription),
    ],
  ),
}

const usageSync: WorkflowTemplate = {
  id: 'usage-sync',
  name: 'Usage sync to Stripe',
  description: 'Send each customer’s usage to Stripe meters. Run it from a cron trigger.',
  icon: 'gauge',
  category: 'billing',
  ir: workflow(
    'Usage sync to Stripe',
    'Reports usage to Stripe billing meters.',
    [
      step(
        'collect_usage',
        [300, 0],
        `  // TODO: read each customer's usage since the last run. Give each record an id
  // that is stable for the customer and period: Stripe drops a repeated identifier,
  // so a retried run doesn't bill twice.
  const records = [{ id: "cus_123-2026-11-16", customerId: "cus_123", quantity: 0 }];
  return { records };`,
      ),
      loopEach('each_customer', [300, 120], '{{collect_usage.records}}', 'record'),
      http('report_usage', [300, 240], {
        url: 'https://api.stripe.com/v1/billing/meter_events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Bearer ${env.STRIPE_SECRET_KEY}',
        },
        // Encoded, so an "&" or "=" in a value can't add a form field.
        body: "new URLSearchParams({ event_name: 'api_requests', identifier: record.id, 'payload[stripe_customer_id]': record.customerId, 'payload[value]': String(record.quantity) }).toString()",
      }),
      slackMessage(
        'post_summary',
        [300, 360],
        '#billing',
        'Usage synced for {{collect_usage.records.length}} customers',
      ),
    ],
    [
      edge('collect_usage', 'each_customer'),
      edge('each_customer', 'report_usage', 'body'),
      edge('each_customer', 'post_summary', 'then'),
    ],
  ),
}

export const billingTemplates: WorkflowTemplate[] = [failedPayment, trialEnding, usageSync]
