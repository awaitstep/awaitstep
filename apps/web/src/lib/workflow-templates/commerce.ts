import { MessageSquare, ShoppingBag, ShoppingCart } from 'lucide-react'
import type { WorkflowTemplate } from './types'
import { edge, sendEmail, sleep, step, waitEdges, waitForEvent, workflow } from './template-nodes'

const orderFulfillment: WorkflowTemplate = {
  id: 'order-fulfillment',
  name: 'Order fulfillment',
  description: 'Create a shipment for a paid order, then email the tracking number.',
  icon: ShoppingCart,
  category: 'commerce',
  ir: workflow(
    'Order fulfillment',
    'Runs on Stripe’s checkout.session.completed event.',
    [
      step(
        'read_order',
        [300, 0],
        `  // The Stripe checkout.session.completed event, sent as the payload.
  // TODO: check the Stripe-Signature header in your trigger before you start this
  // workflow; anyone can post a fake event to a public URL. See "Inbound webhook handler".
  const session = event.payload.data.object;
  return { orderId: session.id, email: session.customer_details.email };`,
      ),
      step(
        'create_shipment',
        [300, 120],
        `  // TODO: create the shipment with your carrier.
  return { trackingId: "TRACKING-123" };`,
      ),
      sendEmail('send_confirmation', [300, 240], {
        to: '{{read_order.email}}',
        subject: 'Your order is on its way',
        html: '<p>Tracking number: {{create_shipment.trackingId}}</p>',
      }),
    ],
    [edge('read_order', 'create_shipment'), edge('create_shipment', 'send_confirmation')],
  ),
}

const waitForPurchase = waitForEvent('wait_for_purchase', [300, 120], {
  eventType: 'cart-purchased',
  timeout: '2 hours',
  onEvent: 'purchased',
  onTimeout: 'send_reminder',
})

const abandonedCart: WorkflowTemplate = {
  id: 'abandoned-cart',
  name: 'Abandoned cart',
  description: 'Email a reminder if a cart isn’t bought within 2 hours.',
  icon: ShoppingBag,
  category: 'commerce',
  ir: workflow(
    'Abandoned cart',
    'Runs when a shopper adds to their cart.',
    [
      step(
        'read_cart',
        [300, 0],
        `  const { cartId, email } = event.payload;
  return { cartId, email };`,
      ),
      waitForPurchase,
      step(
        'purchased',
        [150, 240],
        '  return { status: "purchased", cartId: {{read_cart.cartId}} };',
      ),
      sendEmail('send_reminder', [450, 240], {
        to: '{{read_cart.email}}',
        subject: 'You left something in your cart',
        html: '<p>Your cart is saved. Come back and finish your order.</p>',
      }),
    ],
    [edge('read_cart', 'wait_for_purchase'), ...waitEdges(waitForPurchase)],
  ),
}

const waitForResponse = waitForEvent('wait_for_response', [300, 240], {
  eventType: 'survey-response',
  timeout: '7 days',
  onEvent: 'store_feedback',
  onTimeout: 'mark_no_response',
})

const postPurchaseSurvey: WorkflowTemplate = {
  id: 'post-purchase-survey',
  name: 'Post-purchase survey',
  description: 'Ask for feedback a few days after delivery, and record the answer.',
  icon: MessageSquare,
  category: 'commerce',
  ir: workflow(
    'Post-purchase survey',
    'Runs when an order is delivered.',
    [
      sleep('wait_a_few_days', [300, 0], '3 days'),
      sendEmail('send_survey', [300, 120], {
        to: '{{event.payload.email}}',
        subject: 'How did we do?',
        html: '<p>Tell us about your order in one minute.</p>',
      }),
      waitForResponse,
      step(
        'store_feedback',
        [150, 360],
        `  // TODO: save the response.
  return { orderId: event.payload.orderId, rating: {{wait_for_response.payload.rating}} };`,
      ),
      step(
        'mark_no_response',
        [450, 360],
        `  // TODO: mark the order as no response, or send one reminder.
  return { orderId: event.payload.orderId, status: "no-response" };`,
      ),
    ],
    [
      edge('wait_a_few_days', 'send_survey'),
      edge('send_survey', 'wait_for_response'),
      ...waitEdges(waitForResponse),
    ],
  ),
}

export const commerceTemplates: WorkflowTemplate[] = [
  orderFulfillment,
  abandonedCart,
  postPurchaseSurvey,
]
