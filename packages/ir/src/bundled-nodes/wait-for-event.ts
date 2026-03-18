import type { NodeDefinition } from '../node-definition.js'

export const waitForEventDefinition: NodeDefinition = {
  id: 'wait-for-event',
  name: 'Wait for Event',
  version: '1.0.0',
  description: 'Pause execution until an external event is received.',
  category: 'Scheduling',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    eventType: {
      type: 'string',
      label: 'Event Type',
      required: true,
      placeholder: 'user-approval',
      description: 'Max 100 chars, a-z 0-9 - _ only.',
      validation: { maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' },
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      placeholder: '24 hours',
      description: 'Max 365 days. Workflow throws on timeout expiry.',
    },
  },
  outputSchema: {
    payload: { type: 'object', description: 'The event payload sent via sendEvent()' },
  },
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
