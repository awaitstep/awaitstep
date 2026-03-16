import type { WorkflowIR } from '@awaitstep/ir'

export interface TemplateCategory {
  id: string
  name: string
  description: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  nodeCount: number
  category: string
  ir: WorkflowIR
}

export const templateCategories: TemplateCategory[] = [
  { id: 'ecommerce', name: 'E-Commerce', description: 'Order processing, payments, and fulfillment' },
  { id: 'engagement', name: 'Customer Engagement', description: 'Onboarding, communications, and retention' },
  { id: 'data', name: 'Data & Integration', description: 'ETL pipelines, webhooks, and API orchestration' },
  { id: 'operations', name: 'Operations', description: 'Approvals, alerting, and internal tooling' },
]

const now = '2026-01-01T00:00:00Z'

export const workflowTemplates: WorkflowTemplate[] = [
  // ═══════════════════════════════════════
  // Getting Started
  // ═══════════════════════════════════════

  {
    id: 'hello-world',
    name: 'Hello World',
    description: 'A minimal workflow to test deployment. Greets, waits, then logs.',
    icon: 'Rocket',
    nodeCount: 3,
    category: 'operations',
    ir: {
      metadata: {
        name: 'Hello World',
        description: 'A minimal workflow to verify deployment works.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'greet',
      nodes: [
        {
          id: 'greet',
          type: 'step',
          name: 'greet',
          position: { x: 300, y: 0 },
          code: '  const name = event.payload.name ?? "World";\n  return { message: `Hello, ${name}!`, timestamp: new Date().toISOString() };',
        },
        {
          id: 'pause',
          type: 'sleep',
          name: 'pause',
          position: { x: 300, y: 120 },
          duration: '5 seconds',
        },
        {
          id: 'done',
          type: 'step',
          name: 'done',
          position: { x: 300, y: 240 },
          code: '  return { status: "completed", greeting: {{greet.message}} };',
        },
      ],
      edges: [
        { id: 'e1', source: 'greet', target: 'pause' },
        { id: 'e2', source: 'pause', target: 'done' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // E-Commerce
  // ═══════════════════════════════════════

  {
    id: 'ecommerce-order',
    name: 'Order Fulfillment',
    description: 'Charge payment, create shipment, send confirmation email.',
    icon: 'ShoppingCart',
    nodeCount: 6,
    category: 'ecommerce',
    ir: {
      metadata: {
        name: 'Order Fulfillment',
        description: 'Process e-commerce orders: validate, charge, ship, and confirm.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'validate-order',
      nodes: [
        {
          id: 'validate-order',
          type: 'step',
          name: 'validate-order',
          position: { x: 300, y: 0 },
          code: '  const { orderId, items, customer } = event.payload;\n  if (!orderId || !items?.length) {\n    throw new Error("Invalid order: missing orderId or items");\n  }\n  return { orderId, items, customer, total: items.reduce((sum, i) => sum + i.price * i.qty, 0) };',
        },
        {
          id: 'charge-payment',
          type: 'http-request',
          name: 'charge-payment',
          position: { x: 300, y: 120 },
          url: 'https://api.stripe.com/v1/charges',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Bearer ${env.STRIPE_SECRET_KEY}',
          },
          body: 'amount={{validate-order.total}}&currency=usd&customer={{validate-order.customer.stripeId}}',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
        },
        {
          id: 'check-payment',
          type: 'branch',
          name: 'check-payment',
          position: { x: 300, y: 240 },
          branches: [
            { label: 'true', condition: '{{charge-payment}}.status === "succeeded"' },
            { label: 'false', condition: '' },
          ],
        },
        {
          id: 'create-shipment',
          type: 'step',
          name: 'create-shipment',
          position: { x: 150, y: 360 },
          code: '  const label = {\n    trackingId: `SHIP-${Date.now()}`,\n    carrier: "fedex",\n    address: {{validate-order.customer.address}},\n    items: {{validate-order.items}},\n  };\n  return label;',
        },
        {
          id: 'send-confirmation',
          type: 'http-request',
          name: 'send-confirmation',
          position: { x: 150, y: 480 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "{{validate-order.customer.email}}",\n  "subject": "Order Confirmed",\n  "body": "Your order {{validate-order.orderId}} has shipped. Tracking: {{create-shipment.trackingId}}"\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
        {
          id: 'schedule-followup',
          type: 'sleep',
          name: 'schedule-followup',
          position: { x: 150, y: 600 },
          duration: '3 day',
        },
      ],
      edges: [
        { id: 'e1', source: 'validate-order', target: 'charge-payment' },
        { id: 'e2', source: 'charge-payment', target: 'check-payment' },
        { id: 'e3', source: 'check-payment', target: 'create-shipment', label: 'true' },
        { id: 'e4', source: 'create-shipment', target: 'send-confirmation' },
        { id: 'e5', source: 'send-confirmation', target: 'schedule-followup' },
      ],
    },
  },

  {
    id: 'abandoned-cart',
    name: 'Abandoned Cart Recovery',
    description: 'Detect abandoned cart, wait, then send a reminder email with discount.',
    icon: 'ShoppingBag',
    nodeCount: 5,
    category: 'ecommerce',
    ir: {
      metadata: {
        name: 'Abandoned Cart Recovery',
        description: 'Recover abandoned carts with timed email reminders.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'capture-cart',
      nodes: [
        {
          id: 'capture-cart',
          type: 'step',
          name: 'capture-cart',
          position: { x: 300, y: 0 },
          code: '  const { cartId, userId, items, email } = event.payload;\n  const cartTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);\n  return { cartId, userId, items, email, cartTotal };',
        },
        {
          id: 'wait-for-purchase',
          type: 'wait-for-event',
          name: 'wait-for-purchase',
          position: { x: 300, y: 120 },
          eventType: 'cart-purchased',
          timeout: '2 hour',
        },
        {
          id: 'check-purchased',
          type: 'branch',
          name: 'check-purchased',
          position: { x: 300, y: 240 },
          branches: [
            { label: 'true', condition: '{{wait-for-purchase}}.purchased === true' },
            { label: 'false', condition: '' },
          ],
        },
        {
          id: 'no-action',
          type: 'step',
          name: 'no-action',
          position: { x: 150, y: 360 },
          code: '  return { status: "already-purchased", cartId: {{capture-cart.cartId}} };',
        },
        {
          id: 'send-reminder',
          type: 'http-request',
          name: 'send-reminder',
          position: { x: 450, y: 360 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "{{capture-cart.email}}",\n  "subject": "You left items in your cart!",\n  "body": "Complete your order of ${{capture-cart.cartTotal}} — use code SAVE10 for 10% off."\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'capture-cart', target: 'wait-for-purchase' },
        { id: 'e2', source: 'wait-for-purchase', target: 'check-purchased' },
        { id: 'e3', source: 'check-purchased', target: 'no-action', label: 'true' },
        { id: 'e4', source: 'check-purchased', target: 'send-reminder', label: 'false' },
      ],
    },
  },

  {
    id: 'subscription-renewal',
    name: 'Subscription Renewal',
    description: 'Check expiry, attempt charge, handle failure with dunning emails.',
    icon: 'CreditCard',
    nodeCount: 4,
    category: 'ecommerce',
    ir: {
      metadata: {
        name: 'Subscription Renewal',
        description: 'Automatically renew subscriptions with retry and dunning.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'attempt-charge',
      nodes: [
        {
          id: 'attempt-charge',
          type: 'http-request',
          name: 'attempt-charge',
          position: { x: 300, y: 0 },
          url: 'https://api.stripe.com/v1/payment_intents',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Bearer ${env.STRIPE_SECRET_KEY}',
          },
          body: 'amount=${event.payload.amount}&currency=usd&payment_method=${event.payload.paymentMethod}&confirm=true',
          config: {
            retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
        },
        {
          id: 'check-charge',
          type: 'branch',
          name: 'check-charge',
          position: { x: 300, y: 120 },
          branches: [
            { label: 'true', condition: '{{attempt-charge}}.status === "succeeded"' },
            { label: 'false', condition: '' },
          ],
        },
        {
          id: 'confirm-renewal',
          type: 'step',
          name: 'confirm-renewal',
          position: { x: 150, y: 240 },
          code: '  return {\n    subscriptionId: event.payload.subscriptionId,\n    status: "renewed",\n    nextBillingDate: new Date(Date.now() + 30 * 86400000).toISOString(),\n  };',
        },
        {
          id: 'send-dunning',
          type: 'http-request',
          name: 'send-dunning',
          position: { x: 450, y: 240 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "${event.payload.email}",\n  "subject": "Payment failed — update your card",\n  "body": "We couldn\'t charge your card for the ${event.payload.plan} plan. Please update your payment method."\n}',
          config: {
            retries: { limit: 2, delay: '5 seconds', backoff: 'constant' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'attempt-charge', target: 'check-charge' },
        { id: 'e2', source: 'check-charge', target: 'confirm-renewal', label: 'true' },
        { id: 'e3', source: 'check-charge', target: 'send-dunning', label: 'false' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // Customer Engagement
  // ═══════════════════════════════════════

  {
    id: 'welcome-drip',
    name: 'Welcome Drip Campaign',
    description: 'Onboard new users with a series of timed welcome emails.',
    icon: 'Mail',
    nodeCount: 5,
    category: 'engagement',
    ir: {
      metadata: {
        name: 'Welcome Drip Campaign',
        description: 'Send a timed series of onboarding emails to new users.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'send-welcome',
      nodes: [
        {
          id: 'send-welcome',
          type: 'http-request',
          name: 'send-welcome',
          position: { x: 300, y: 0 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "${event.payload.email}",\n  "subject": "Welcome to our platform, ${event.payload.name}!",\n  "body": "We\'re excited to have you. Here\'s how to get started..."\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
        {
          id: 'wait-day-1',
          type: 'sleep',
          name: 'wait-day-1',
          position: { x: 300, y: 120 },
          duration: '1 day',
        },
        {
          id: 'send-tips',
          type: 'http-request',
          name: 'send-tips',
          position: { x: 300, y: 240 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "${event.payload.email}",\n  "subject": "3 tips to get the most out of your account",\n  "body": "Tip 1: Set up your profile. Tip 2: Connect integrations. Tip 3: Invite your team."\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
        {
          id: 'wait-day-3',
          type: 'sleep',
          name: 'wait-day-3',
          position: { x: 300, y: 360 },
          duration: '3 day',
        },
        {
          id: 'send-checkin',
          type: 'http-request',
          name: 'send-checkin',
          position: { x: 300, y: 480 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "${event.payload.email}",\n  "subject": "How\'s it going, ${event.payload.name}?",\n  "body": "We noticed you signed up recently. Need any help getting started?"\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'send-welcome', target: 'wait-day-1' },
        { id: 'e2', source: 'wait-day-1', target: 'send-tips' },
        { id: 'e3', source: 'send-tips', target: 'wait-day-3' },
        { id: 'e4', source: 'wait-day-3', target: 'send-checkin' },
      ],
    },
  },

  {
    id: 'feedback-survey',
    name: 'Post-Purchase Survey',
    description: 'Wait after purchase, send feedback survey, collect and store response.',
    icon: 'MessageSquare',
    nodeCount: 4,
    category: 'engagement',
    ir: {
      metadata: {
        name: 'Post-Purchase Survey',
        description: 'Collect customer feedback after a purchase with timed follow-up.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'wait-for-delivery',
      nodes: [
        {
          id: 'wait-for-delivery',
          type: 'sleep',
          name: 'wait-for-delivery',
          position: { x: 300, y: 0 },
          duration: '5 day',
        },
        {
          id: 'send-survey',
          type: 'http-request',
          name: 'send-survey',
          position: { x: 300, y: 120 },
          url: 'https://api.sendgrid.com/v3/mail/send',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.SENDGRID_API_KEY}',
          },
          body: '{\n  "to": "${event.payload.email}",\n  "subject": "How was your ${event.payload.productName}?",\n  "body": "We\'d love your feedback! Rate your experience: https://example.com/survey/${event.payload.orderId}"\n}',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
        },
        {
          id: 'wait-for-response',
          type: 'wait-for-event',
          name: 'wait-for-response',
          position: { x: 300, y: 240 },
          eventType: 'survey-response',
          timeout: '7 day',
        },
        {
          id: 'store-feedback',
          type: 'step',
          name: 'store-feedback',
          position: { x: 300, y: 360 },
          code: '  const rating = {{wait-for-response.rating}} ?? null;\n  const comment = {{wait-for-response.comment}} ?? "";\n  return {\n    orderId: event.payload.orderId,\n    userId: event.payload.userId,\n    rating,\n    comment,\n    collectedAt: new Date().toISOString(),\n  };',
        },
      ],
      edges: [
        { id: 'e1', source: 'wait-for-delivery', target: 'send-survey' },
        { id: 'e2', source: 'send-survey', target: 'wait-for-response' },
        { id: 'e3', source: 'wait-for-response', target: 'store-feedback' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // Data & Integration
  // ═══════════════════════════════════════

  {
    id: 'data-pipeline',
    name: 'Scheduled Data Pipeline',
    description: 'Fetch data from API, transform, store in D1, and send a summary report.',
    icon: 'Database',
    nodeCount: 5,
    category: 'data',
    ir: {
      metadata: {
        name: 'Data Pipeline',
        description: 'ETL pipeline: fetch, transform, store, and report.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'fetch-source-data',
      nodes: [
        {
          id: 'fetch-source-data',
          type: 'http-request',
          name: 'fetch-source-data',
          position: { x: 300, y: 0 },
          url: 'https://api.example.com/v1/records?since=${event.payload.lastRunAt}',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer ${env.API_TOKEN}',
            'Accept': 'application/json',
          },
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
            timeout: '60 seconds',
          },
        },
        {
          id: 'transform-data',
          type: 'step',
          name: 'transform-data',
          position: { x: 300, y: 120 },
          code: '  const records = {{fetch-source-data.data}} ?? [];\n  const cleaned = records\n    .filter((r) => r.status === "active")\n    .map((r) => ({\n      id: r.id,\n      name: r.name.trim().toLowerCase(),\n      value: Math.round(r.value * 100) / 100,\n      updatedAt: new Date().toISOString(),\n    }));\n  return { records: cleaned, count: cleaned.length };',
        },
        {
          id: 'store-results',
          type: 'step',
          name: 'store-results',
          position: { x: 300, y: 240 },
          code: '  const { records } = {{transform-data}};\n  // Batch insert into D1\n  const stmt = env.DB.prepare(\n    "INSERT INTO records (id, name, value, updated_at) VALUES (?, ?, ?, ?)"\n  );\n  const batch = records.map((r) =>\n    stmt.bind(r.id, r.name, r.value, r.updatedAt)\n  );\n  await env.DB.batch(batch);\n  return { inserted: records.length };',
        },
        {
          id: 'wait-interval',
          type: 'sleep',
          name: 'wait-interval',
          position: { x: 300, y: 360 },
          duration: '1 hour',
        },
        {
          id: 'send-report',
          type: 'http-request',
          name: 'send-report',
          position: { x: 300, y: 480 },
          url: 'https://hooks.slack.com/services/T00/B00/webhook',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{\n  "text": "Pipeline complete: {{store-results.inserted}} records processed"\n}',
          config: {
            retries: { limit: 2, delay: '5 seconds', backoff: 'constant' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'fetch-source-data', target: 'transform-data' },
        { id: 'e2', source: 'transform-data', target: 'store-results' },
        { id: 'e3', source: 'store-results', target: 'wait-interval' },
        { id: 'e4', source: 'wait-interval', target: 'send-report' },
      ],
    },
  },

  {
    id: 'parallel-fanout',
    name: 'Parallel Fan-Out / Fan-In',
    description: 'Fan out to multiple processors in parallel, then aggregate results.',
    icon: 'GitFork',
    nodeCount: 5,
    category: 'data',
    ir: {
      metadata: {
        name: 'Parallel Processing',
        description: 'Fan out work to multiple regions and aggregate results.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'prepare-batch',
      nodes: [
        {
          id: 'prepare-batch',
          type: 'step',
          name: 'prepare-batch',
          position: { x: 300, y: 0 },
          code: '  const items = event.payload.items ?? [];\n  const batchSize = Math.ceil(items.length / 2);\n  return {\n    usBatch: items.slice(0, batchSize),\n    euBatch: items.slice(batchSize),\n    totalItems: items.length,\n  };',
        },
        {
          id: 'fan-out',
          type: 'parallel',
          name: 'fan-out',
          position: { x: 300, y: 120 },
        },
        {
          id: 'process-region-us',
          type: 'http-request',
          name: 'process-region-us',
          position: { x: 150, y: 240 },
          url: 'https://us.api.example.com/v1/process',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.US_API_KEY}',
          },
          body: '{ "items": {{prepare-batch.usBatch}} }',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
        },
        {
          id: 'process-region-eu',
          type: 'http-request',
          name: 'process-region-eu',
          position: { x: 450, y: 240 },
          url: 'https://eu.api.example.com/v1/process',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ${env.EU_API_KEY}',
          },
          body: '{ "items": {{prepare-batch.euBatch}} }',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
        },
        {
          id: 'aggregate-results',
          type: 'step',
          name: 'aggregate-results',
          position: { x: 300, y: 360 },
          code: '  const usResults = {{process-region-us}} ?? [];\n  const euResults = {{process-region-eu}} ?? [];\n  const merged = [...usResults, ...euResults];\n  return {\n    totalProcessed: merged.length,\n    results: merged,\n    completedAt: new Date().toISOString(),\n  };',
        },
      ],
      edges: [
        { id: 'e1', source: 'prepare-batch', target: 'fan-out' },
        { id: 'e2', source: 'fan-out', target: 'process-region-us' },
        { id: 'e3', source: 'fan-out', target: 'process-region-eu' },
        { id: 'e4', source: 'process-region-us', target: 'aggregate-results' },
        { id: 'e5', source: 'process-region-eu', target: 'aggregate-results' },
      ],
    },
  },

  {
    id: 'webhook-retry',
    name: 'Webhook Retry with Backoff',
    description: 'Deliver webhooks with HMAC signatures and exponential backoff.',
    icon: 'Webhook',
    nodeCount: 7,
    category: 'data',
    ir: {
      metadata: {
        name: 'Webhook Delivery',
        description: 'Deliver webhooks with retry logic and exponential backoff.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'parse-webhook',
      nodes: [
        {
          id: 'parse-webhook',
          type: 'step',
          name: 'parse-webhook',
          position: { x: 300, y: 0 },
          code: '  const { url, payload, secret } = event.payload;\n  if (!url || !payload) {\n    throw new Error("Missing required fields: url and payload");\n  }\n  const signature = await crypto.subtle.sign(\n    "HMAC",\n    secret,\n    new TextEncoder().encode(JSON.stringify(payload))\n  );\n  return { url, payload, signature: btoa(String.fromCharCode(...new Uint8Array(signature))) };',
        },
        {
          id: 'deliver-webhook',
          type: 'http-request',
          name: 'deliver-webhook',
          position: { x: 300, y: 120 },
          url: '{{parse-webhook.url}}',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': '{{parse-webhook.signature}}',
          },
          body: '${JSON.stringify({{parse-webhook.payload}})}',
          config: {
            retries: { limit: 5, delay: '1 second', backoff: 'exponential' },
            timeout: '30 seconds',
          },
        },
        {
          id: 'check-delivery',
          type: 'branch',
          name: 'check-delivery',
          position: { x: 300, y: 240 },
          branches: [
            { label: 'success', condition: '{{deliver-webhook}}.status >= 200 && {{deliver-webhook}}.status < 300' },
            { label: 'rate-limited', condition: '{{deliver-webhook}}.status === 429' },
            { label: 'failed', condition: '' },
          ],
        },
        {
          id: 'log-success',
          type: 'step',
          name: 'log-success',
          position: { x: 100, y: 360 },
          code: '  return {\n    webhookId: {{parse-webhook.url}},\n    delivered: true,\n    status: {{deliver-webhook.status}},\n    completedAt: new Date().toISOString(),\n  };',
        },
        {
          id: 'rate-limit-wait',
          type: 'sleep',
          name: 'rate-limit-wait',
          position: { x: 300, y: 360 },
          duration: '60 second',
        },
        {
          id: 'backoff-wait',
          type: 'sleep',
          name: 'backoff-wait',
          position: { x: 500, y: 360 },
          duration: '30 second',
        },
        {
          id: 'log-failure',
          type: 'step',
          name: 'log-failure',
          position: { x: 500, y: 480 },
          code: '  return {\n    webhookId: {{parse-webhook.url}},\n    delivered: false,\n    status: {{deliver-webhook.status}},\n    error: "Delivery failed after retries",\n    failedAt: new Date().toISOString(),\n  };',
        },
      ],
      edges: [
        { id: 'e1', source: 'parse-webhook', target: 'deliver-webhook' },
        { id: 'e2', source: 'deliver-webhook', target: 'check-delivery' },
        { id: 'e3', source: 'check-delivery', target: 'log-success', label: 'success' },
        { id: 'e4', source: 'check-delivery', target: 'rate-limit-wait', label: 'rate-limited' },
        { id: 'e5', source: 'check-delivery', target: 'backoff-wait', label: 'failed' },
        { id: 'e6', source: 'backoff-wait', target: 'log-failure' },
      ],
    },
  },

  // ═══════════════════════════════════════
  // Operations
  // ═══════════════════════════════════════

  {
    id: 'approval-workflow',
    name: 'Human-in-the-Loop Approval',
    description: 'Submit request, wait for human approval, then process or reject.',
    icon: 'UserCheck',
    nodeCount: 4,
    category: 'operations',
    ir: {
      metadata: {
        name: 'Approval Workflow',
        description: 'Wait for human approval before processing a request.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'wait-for-approval',
      nodes: [
        {
          id: 'wait-for-approval',
          type: 'wait-for-event',
          name: 'wait-for-approval',
          position: { x: 300, y: 0 },
          eventType: 'approval',
          timeout: '48 hour',
        },
        {
          id: 'check-approval',
          type: 'branch',
          name: 'check-approval',
          position: { x: 300, y: 120 },
          branches: [
            { label: 'true', condition: '{{wait-for-approval}}.approved === true' },
            { label: 'false', condition: '' },
          ],
        },
        {
          id: 'process-approved',
          type: 'step',
          name: 'process-approved',
          position: { x: 150, y: 240 },
          code: '  return {\n    status: "approved",\n    processedAt: new Date().toISOString(),\n    approver: {{wait-for-approval.approvedBy}},\n    requestId: event.payload.id,\n  };',
        },
        {
          id: 'handle-rejected',
          type: 'step',
          name: 'handle-rejected',
          position: { x: 450, y: 240 },
          code: '  return {\n    status: "rejected",\n    rejectedAt: new Date().toISOString(),\n    reason: {{wait-for-approval.reason}} ?? "No reason provided",\n    requestId: event.payload.id,\n  };',
        },
      ],
      edges: [
        { id: 'e1', source: 'wait-for-approval', target: 'check-approval' },
        { id: 'e2', source: 'check-approval', target: 'process-approved', label: 'true' },
        { id: 'e3', source: 'check-approval', target: 'handle-rejected', label: 'false' },
      ],
    },
  },

  {
    id: 'incident-escalation',
    name: 'Incident Alert Escalation',
    description: 'Notify on-call, wait for acknowledgement, escalate if no response.',
    icon: 'Siren',
    nodeCount: 5,
    category: 'operations',
    ir: {
      metadata: {
        name: 'Incident Escalation',
        description: 'Alert on-call engineers with automatic escalation on timeout.',
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      entryNodeId: 'notify-oncall',
      nodes: [
        {
          id: 'notify-oncall',
          type: 'http-request',
          name: 'notify-oncall',
          position: { x: 300, y: 0 },
          url: 'https://hooks.slack.com/services/T00/B00/oncall',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{\n  "text": "[${event.payload.severity}] ${event.payload.service}: ${event.payload.message}\\nAck: https://ops.example.com/ack/${event.instanceId}"\n}',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
          },
        },
        {
          id: 'wait-for-ack',
          type: 'wait-for-event',
          name: 'wait-for-ack',
          position: { x: 300, y: 120 },
          eventType: 'incident-ack',
          timeout: '15 minute',
        },
        {
          id: 'check-ack',
          type: 'branch',
          name: 'check-ack',
          position: { x: 300, y: 240 },
          branches: [
            { label: 'true', condition: '{{wait-for-ack}}.acknowledged === true' },
            { label: 'false', condition: '' },
          ],
        },
        {
          id: 'record-ack',
          type: 'step',
          name: 'record-ack',
          position: { x: 150, y: 360 },
          code: '  return {\n    instanceId: event.instanceId,\n    status: "acknowledged",\n    acknowledgedBy: {{wait-for-ack.acknowledgedBy}},\n    acknowledgedAt: new Date().toISOString(),\n  };',
        },
        {
          id: 'escalate',
          type: 'http-request',
          name: 'escalate',
          position: { x: 450, y: 360 },
          url: 'https://hooks.slack.com/services/T00/B00/escalation',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{\n  "text": "ESCALATION: Not acknowledged after 15 min.\\n[${event.payload.severity}] ${event.payload.service}: ${event.payload.message}"\n}',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'notify-oncall', target: 'wait-for-ack' },
        { id: 'e2', source: 'wait-for-ack', target: 'check-ack' },
        { id: 'e3', source: 'check-ack', target: 'record-ack', label: 'true' },
        { id: 'e4', source: 'check-ack', target: 'escalate', label: 'false' },
      ],
    },
  },
]
