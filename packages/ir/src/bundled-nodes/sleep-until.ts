import type { NodeDefinition } from '../node-definition.js'

export const sleepUntilDefinition: NodeDefinition = {
  id: 'sleep_until',
  name: 'Sleep Until',
  version: '1.0.0',
  description: 'Pause execution until a specific timestamp.',
  category: 'Scheduling',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    timestamp: {
      type: 'string',
      label: 'Date & Time',
      required: true,
      description: 'ISO 8601 timestamp. Must be at least 1 hour from now.',
      validation: { format: 'date-time' },
    },
  },
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
