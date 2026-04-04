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
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    description: 'Order processing, payments, and fulfillment',
  },
  {
    id: 'engagement',
    name: 'Customer Engagement',
    description: 'Onboarding, communications, and retention',
  },
  {
    id: 'data',
    name: 'Data & Integration',
    description: 'ETL pipelines, webhooks, and API orchestration',
  },
  {
    id: 'operations',
    name: 'Operations',
    description: 'Approvals, alerting, and internal tooling',
  },
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
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const name = event.payload.name ?? "World";\n  return { message: `Hello, ${name}!`, timestamp: new Date().toISOString() };',
          },
        },
        {
          id: 'pause',
          type: 'sleep',
          name: 'pause',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '5 seconds',
          },
        },
        {
          id: 'done',
          type: 'step',
          name: 'done',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return { status: "completed", greeting: {{greet.message}} };',
          },
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
      entryNodeId: 'validate_order',
      nodes: [
        {
          id: 'validate_order',
          type: 'step',
          name: 'validate_order',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const { orderId, items, customer } = event.payload;\n  if (!orderId || !items?.length) {\n    throw new Error("Invalid order: missing orderId or items");\n  }\n  return { orderId, items, customer, total: items.reduce((sum, i) => sum + i.price * i.qty, 0) };',
          },
        },
        {
          id: 'charge_payment',
          type: 'http_request',
          name: 'charge_payment',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          data: {
            url: 'https://api.stripe.com/v1/charges',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Bearer ${env.STRIPE_SECRET_KEY}',
            },
            body: '`amount=${{{validate_order.total}}}&currency=usd&customer=${{{validate_order.customer.stripeId}}}`',
          },
        },
        {
          id: 'check_payment',
          type: 'branch',
          name: 'check_payment',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              { label: 'true', condition: '{{charge_payment}}.status === "succeeded"' },
              { label: 'false', condition: '' },
            ],
          },
        },
        {
          id: 'create_shipment',
          type: 'step',
          name: 'create_shipment',
          position: { x: 150, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const label = {\n    trackingId: `SHIP-${Date.now()}`,\n    carrier: "fedex",\n    address: {{validate_order.customer.address}},\n    items: {{validate_order.items}},\n  };\n  return label;',
          },
        },
        {
          id: 'send_confirmation',
          type: 'http_request',
          name: 'send_confirmation',
          position: { x: 150, y: 480 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: {{validate_order.customer.email}},\n  subject: "Order Confirmed",\n  body: `Your order ${{{validate_order.orderId}}} has shipped. Tracking: ${{{create_shipment.trackingId}}}`\n})',
          },
        },
        {
          id: 'schedule_followup',
          type: 'sleep',
          name: 'schedule_followup',
          position: { x: 150, y: 600 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '3 day',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'validate_order', target: 'charge_payment' },
        { id: 'e2', source: 'charge_payment', target: 'check_payment' },
        { id: 'e3', source: 'check_payment', target: 'create_shipment', label: 'true' },
        { id: 'e4', source: 'create_shipment', target: 'send_confirmation' },
        { id: 'e5', source: 'send_confirmation', target: 'schedule_followup' },
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
      entryNodeId: 'capture_cart',
      nodes: [
        {
          id: 'capture_cart',
          type: 'step',
          name: 'capture_cart',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const { cartId, userId, items, email } = event.payload;\n  const cartTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);\n  return { cartId, userId, items, email, cartTotal };',
          },
        },
        {
          id: 'wait_for_purchase',
          type: 'wait_for_event',
          name: 'wait_for_purchase',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            eventType: 'cart-purchased',
            timeout: '2 hour',
          },
        },
        {
          id: 'check_purchased',
          type: 'branch',
          name: 'check_purchased',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              { label: 'true', condition: '{{wait_for_purchase}}.purchased === true' },
              { label: 'false', condition: '' },
            ],
          },
        },
        {
          id: 'no_action',
          type: 'step',
          name: 'no_action',
          position: { x: 150, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return { status: "already-purchased", cartId: {{capture_cart.cartId}} };',
          },
        },
        {
          id: 'send_reminder',
          type: 'http_request',
          name: 'send_reminder',
          position: { x: 450, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: {{capture_cart.email}},\n  subject: "You left items in your cart!",\n  body: `Complete your order of $${{{capture_cart.cartTotal}}} — use code SAVE10 for 10% off.`\n})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'capture_cart', target: 'wait_for_purchase' },
        { id: 'e2', source: 'wait_for_purchase', target: 'check_purchased' },
        { id: 'e3', source: 'check_purchased', target: 'no_action', label: 'true' },
        { id: 'e4', source: 'check_purchased', target: 'send_reminder', label: 'false' },
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
      entryNodeId: 'attempt_charge',
      nodes: [
        {
          id: 'attempt_charge',
          type: 'http_request',
          name: 'attempt_charge',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          data: {
            url: 'https://api.stripe.com/v1/payment_intents',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Bearer ${env.STRIPE_SECRET_KEY}',
            },
            body: '`amount=${event.payload.amount}&currency=usd&payment_method=${event.payload.paymentMethod}&confirm=true`',
          },
        },
        {
          id: 'check_charge',
          type: 'branch',
          name: 'check_charge',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              { label: 'true', condition: '{{attempt_charge}}.status === "succeeded"' },
              { label: 'false', condition: '' },
            ],
          },
        },
        {
          id: 'confirm_renewal',
          type: 'step',
          name: 'confirm_renewal',
          position: { x: 150, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    subscriptionId: event.payload.subscriptionId,\n    status: "renewed",\n    nextBillingDate: new Date(Date.now() + 30 * 86400000).toISOString(),\n  };',
          },
        },
        {
          id: 'send_dunning',
          type: 'http_request',
          name: 'send_dunning',
          position: { x: 450, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 2, delay: '5 seconds', backoff: 'constant' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: event.payload.email,\n  subject: "Payment failed — update your card",\n  body: `We couldn\'t charge your card for the ${event.payload.plan} plan. Please update your payment method.`\n})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'attempt_charge', target: 'check_charge' },
        { id: 'e2', source: 'check_charge', target: 'confirm_renewal', label: 'true' },
        { id: 'e3', source: 'check_charge', target: 'send_dunning', label: 'false' },
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
      entryNodeId: 'send_welcome',
      nodes: [
        {
          id: 'send_welcome',
          type: 'http_request',
          name: 'send_welcome',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: event.payload.email,\n  subject: `Welcome to our platform, ${event.payload.name}!`,\n  body: "We\'re excited to have you. Here\'s how to get started..."\n})',
          },
        },
        {
          id: 'wait_day_1',
          type: 'sleep',
          name: 'wait_day_1',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '1 day',
          },
        },
        {
          id: 'send_tips',
          type: 'http_request',
          name: 'send_tips',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: event.payload.email,\n  subject: "3 tips to get the most out of your account",\n  body: "Tip 1: Set up your profile. Tip 2: Connect integrations. Tip 3: Invite your team."\n})',
          },
        },
        {
          id: 'wait_day_3',
          type: 'sleep',
          name: 'wait_day_3',
          position: { x: 300, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '3 day',
          },
        },
        {
          id: 'send_checkin',
          type: 'http_request',
          name: 'send_checkin',
          position: { x: 300, y: 480 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: 'JSON.stringify({\n  to: event.payload.email,\n  subject: `How\'s it going, ${event.payload.name}?`,\n  body: "We noticed you signed up recently. Need any help getting started?"\n})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'send_welcome', target: 'wait_day_1' },
        { id: 'e2', source: 'wait_day_1', target: 'send_tips' },
        { id: 'e3', source: 'send_tips', target: 'wait_day_3' },
        { id: 'e4', source: 'wait_day_3', target: 'send_checkin' },
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
      entryNodeId: 'wait_for_delivery',
      nodes: [
        {
          id: 'wait_for_delivery',
          type: 'sleep',
          name: 'wait_for_delivery',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '5 day',
          },
        },
        {
          id: 'send_survey',
          type: 'http_request',
          name: 'send_survey',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://api.sendgrid.com/v3/mail/send',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.SENDGRID_API_KEY}',
            },
            body: "JSON.stringify({\n  to: event.payload.email,\n  subject: `How was your ${event.payload.productName}?`,\n  body: `We'd love your feedback! Rate your experience: https://example.com/survey/${event.payload.orderId}`\n})",
          },
        },
        {
          id: 'wait_for_response',
          type: 'wait_for_event',
          name: 'wait_for_response',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            eventType: 'survey-response',
            timeout: '7 day',
          },
        },
        {
          id: 'store_feedback',
          type: 'step',
          name: 'store_feedback',
          position: { x: 300, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const rating = {{wait_for_response.rating}} ?? null;\n  const comment = {{wait_for_response.comment}} ?? "";\n  return {\n    orderId: event.payload.orderId,\n    userId: event.payload.userId,\n    rating,\n    comment,\n    collectedAt: new Date().toISOString(),\n  };',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'wait_for_delivery', target: 'send_survey' },
        { id: 'e2', source: 'send_survey', target: 'wait_for_response' },
        { id: 'e3', source: 'wait_for_response', target: 'store_feedback' },
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
      entryNodeId: 'fetch_source_data',
      nodes: [
        {
          id: 'fetch_source_data',
          type: 'http_request',
          name: 'fetch_source_data',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
            timeout: '60 seconds',
          },
          data: {
            url: 'https://api.example.com/v1/records?since=${event.payload.lastRunAt}',
            method: 'GET',
            headers: {
              Authorization: 'Bearer ${env.API_TOKEN}',
              Accept: 'application/json',
            },
          },
        },
        {
          id: 'transform_data',
          type: 'step',
          name: 'transform_data',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const records = {{fetch_source_data.data}} ?? [];\n  const cleaned = records\n    .filter((r) => r.status === "active")\n    .map((r) => ({\n      id: r.id,\n      name: r.name.trim().toLowerCase(),\n      value: Math.round(r.value * 100) / 100,\n      updatedAt: new Date().toISOString(),\n    }));\n  return { records: cleaned, count: cleaned.length };',
          },
        },
        {
          id: 'store_results',
          type: 'step',
          name: 'store_results',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const { records } = {{transform_data}};\n  // Batch insert into D1\n  const stmt = env.DB.prepare(\n    "INSERT INTO records (id, name, value, updated_at) VALUES (?, ?, ?, ?)"\n  );\n  const batch = records.map((r) =>\n    stmt.bind(r.id, r.name, r.value, r.updatedAt)\n  );\n  await env.DB.batch(batch);\n  return { inserted: records.length };',
          },
        },
        {
          id: 'wait_interval',
          type: 'sleep',
          name: 'wait_interval',
          position: { x: 300, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '1 hour',
          },
        },
        {
          id: 'send_report',
          type: 'http_request',
          name: 'send_report',
          position: { x: 300, y: 480 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 2, delay: '5 seconds', backoff: 'constant' },
          },
          data: {
            url: 'https://hooks.slack.com/services/T00/B00/webhook',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'JSON.stringify({\n  text: `Pipeline complete: ${{{store_results.inserted}}} records processed`\n})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'fetch_source_data', target: 'transform_data' },
        { id: 'e2', source: 'transform_data', target: 'store_results' },
        { id: 'e3', source: 'store_results', target: 'wait_interval' },
        { id: 'e4', source: 'wait_interval', target: 'send_report' },
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
      entryNodeId: 'prepare_batch',
      nodes: [
        {
          id: 'prepare_batch',
          type: 'step',
          name: 'prepare_batch',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const items = event.payload.items ?? [];\n  const batchSize = Math.ceil(items.length / 2);\n  return {\n    usBatch: items.slice(0, batchSize),\n    euBatch: items.slice(batchSize),\n    totalItems: items.length,\n  };',
          },
        },
        {
          id: 'fan_out',
          type: 'parallel',
          name: 'fan_out',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {},
        },
        {
          id: 'process_region_us',
          type: 'http_request',
          name: 'process_region_us',
          position: { x: 150, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
          data: {
            url: 'https://us.api.example.com/v1/process',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.US_API_KEY}',
            },
            body: 'JSON.stringify({ items: {{prepare_batch.usBatch}} })',
          },
        },
        {
          id: 'process_region_eu',
          type: 'http_request',
          name: 'process_region_eu',
          position: { x: 450, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
            timeout: '120 seconds',
          },
          data: {
            url: 'https://eu.api.example.com/v1/process',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ${env.EU_API_KEY}',
            },
            body: 'JSON.stringify({ items: {{prepare_batch.euBatch}} })',
          },
        },
        {
          id: 'aggregate_results',
          type: 'step',
          name: 'aggregate_results',
          position: { x: 300, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const usResults = {{process_region_us}} ?? [];\n  const euResults = {{process_region_eu}} ?? [];\n  const merged = [...usResults, ...euResults];\n  return {\n    totalProcessed: merged.length,\n    results: merged,\n    completedAt: new Date().toISOString(),\n  };',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'prepare_batch', target: 'fan_out' },
        { id: 'e2', source: 'fan_out', target: 'process_region_us' },
        { id: 'e3', source: 'fan_out', target: 'process_region_eu' },
        { id: 'e4', source: 'process_region_us', target: 'aggregate_results' },
        { id: 'e5', source: 'process_region_eu', target: 'aggregate_results' },
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
      entryNodeId: 'parse_webhook',
      nodes: [
        {
          id: 'parse_webhook',
          type: 'step',
          name: 'parse_webhook',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  const { url, payload, secret } = event.payload;\n  if (!url || !payload) {\n    throw new Error("Missing required fields: url and payload");\n  }\n  const signature = await crypto.subtle.sign(\n    "HMAC",\n    secret,\n    new TextEncoder().encode(JSON.stringify(payload))\n  );\n  return { url, payload, signature: btoa(String.fromCharCode(...new Uint8Array(signature))) };',
          },
        },
        {
          id: 'deliver_webhook',
          type: 'http_request',
          name: 'deliver_webhook',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 5, delay: '1 second', backoff: 'exponential' },
            timeout: '30 seconds',
          },
          data: {
            url: '{{parse_webhook.url}}',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': '{{parse_webhook.signature}}',
            },
            body: 'JSON.stringify({{parse_webhook.payload}})',
          },
        },
        {
          id: 'check_delivery',
          type: 'branch',
          name: 'check_delivery',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              {
                label: 'success',
                condition: '{{deliver_webhook}}.status >= 200 && {{deliver_webhook}}.status < 300',
              },
              { label: 'rate-limited', condition: '{{deliver_webhook}}.status === 429' },
              { label: 'failed', condition: '' },
            ],
          },
        },
        {
          id: 'log_success',
          type: 'step',
          name: 'log_success',
          position: { x: 100, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    webhookId: {{parse_webhook.url}},\n    delivered: true,\n    status: {{deliver_webhook.status}},\n    completedAt: new Date().toISOString(),\n  };',
          },
        },
        {
          id: 'rate_limit_wait',
          type: 'sleep',
          name: 'rate_limit_wait',
          position: { x: 300, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '60 second',
          },
        },
        {
          id: 'backoff_wait',
          type: 'sleep',
          name: 'backoff_wait',
          position: { x: 500, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            duration: '30 second',
          },
        },
        {
          id: 'log_failure',
          type: 'step',
          name: 'log_failure',
          position: { x: 500, y: 480 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    webhookId: {{parse_webhook.url}},\n    delivered: false,\n    status: {{deliver_webhook.status}},\n    error: "Delivery failed after retries",\n    failedAt: new Date().toISOString(),\n  };',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'parse_webhook', target: 'deliver_webhook' },
        { id: 'e2', source: 'deliver_webhook', target: 'check_delivery' },
        { id: 'e3', source: 'check_delivery', target: 'log_success', label: 'success' },
        { id: 'e4', source: 'check_delivery', target: 'rate_limit_wait', label: 'rate-limited' },
        { id: 'e5', source: 'check_delivery', target: 'backoff_wait', label: 'failed' },
        { id: 'e6', source: 'backoff_wait', target: 'log_failure' },
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
      entryNodeId: 'wait_for_approval',
      nodes: [
        {
          id: 'wait_for_approval',
          type: 'wait_for_event',
          name: 'wait_for_approval',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            eventType: 'approval',
            timeout: '48 hour',
          },
        },
        {
          id: 'check_approval',
          type: 'branch',
          name: 'check_approval',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              { label: 'true', condition: '{{wait_for_approval}}.approved === true' },
              { label: 'false', condition: '' },
            ],
          },
        },
        {
          id: 'process_approved',
          type: 'step',
          name: 'process_approved',
          position: { x: 150, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    status: "approved",\n    processedAt: new Date().toISOString(),\n    approver: {{wait_for_approval.approvedBy}},\n    requestId: event.payload.id,\n  };',
          },
        },
        {
          id: 'handle_rejected',
          type: 'step',
          name: 'handle_rejected',
          position: { x: 450, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    status: "rejected",\n    rejectedAt: new Date().toISOString(),\n    reason: {{wait_for_approval.reason}} ?? "No reason provided",\n    requestId: event.payload.id,\n  };',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'wait_for_approval', target: 'check_approval' },
        { id: 'e2', source: 'check_approval', target: 'process_approved', label: 'true' },
        { id: 'e3', source: 'check_approval', target: 'handle_rejected', label: 'false' },
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
      entryNodeId: 'notify_oncall',
      nodes: [
        {
          id: 'notify_oncall',
          type: 'http_request',
          name: 'notify_oncall',
          position: { x: 300, y: 0 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://hooks.slack.com/services/T00/B00/oncall',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'JSON.stringify({\n  text: `[${event.payload.severity}] ${event.payload.service}: ${event.payload.message}\\nAck: https://ops.example.com/ack/${event.instanceId}`\n})',
          },
        },
        {
          id: 'wait_for_ack',
          type: 'wait_for_event',
          name: 'wait_for_ack',
          position: { x: 300, y: 120 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            eventType: 'incident-ack',
            timeout: '15 minute',
          },
        },
        {
          id: 'check_ack',
          type: 'branch',
          name: 'check_ack',
          position: { x: 300, y: 240 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            branches: [
              { label: 'true', condition: '{{wait_for_ack}}.acknowledged === true' },
              { label: 'false', condition: '' },
            ],
          },
        },
        {
          id: 'record_ack',
          type: 'step',
          name: 'record_ack',
          position: { x: 150, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: {
            code: '  return {\n    instanceId: event.instanceId,\n    status: "acknowledged",\n    acknowledgedBy: {{wait_for_ack.acknowledgedBy}},\n    acknowledgedAt: new Date().toISOString(),\n  };',
          },
        },
        {
          id: 'escalate',
          type: 'http_request',
          name: 'escalate',
          position: { x: 450, y: 360 },
          version: '1.0.0',
          provider: 'cloudflare',
          config: {
            retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
          },
          data: {
            url: 'https://hooks.slack.com/services/T00/B00/escalation',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'JSON.stringify({\n  text: `ESCALATION: Not acknowledged after 15 min.\\n[${event.payload.severity}] ${event.payload.service}: ${event.payload.message}`\n})',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'notify_oncall', target: 'wait_for_ack' },
        { id: 'e2', source: 'wait_for_ack', target: 'check_ack' },
        { id: 'e3', source: 'check_ack', target: 'record_ack', label: 'true' },
        { id: 'e4', source: 'check_ack', target: 'escalate', label: 'false' },
      ],
    },
  },
]
