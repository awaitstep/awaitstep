import type { NodeDefinition } from '../node-definition.js'

export const sleepDefinition: NodeDefinition = {
  id: 'sleep',
  name: 'Sleep',
  version: '1.0.0',
  description: 'Pause execution for a duration.',
  category: 'Scheduling',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    duration: {
      type: 'string',
      label: 'Duration',
      required: true,
      placeholder: '10 seconds',
      description: 'Max 365 days. Does not count toward the step limit.',
    },
  },
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
