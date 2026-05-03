import type { NodeDefinition } from '../node-definition.js'

export const stepDefinition: NodeDefinition = {
  id: 'step',
  name: 'Step',
  version: '1.0.0',
  description: 'Run custom code inside a durable step.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    code: {
      type: 'code',
      label: 'Step Code',
      required: true,
      description:
        'TypeScript code to execute. ctx.attempt is the current retry (1-indexed). Return value must be serializable.',
    },
    inline: {
      type: 'boolean',
      label: 'Inline (no step.do)',
      default: false,
      description:
        'Emit this code directly in the workflow body instead of wrapping it in step.do. Loses durability and retries — use for pure transforms or quick checks.',
    },
    retryLimit: {
      type: 'number',
      label: 'Retry Limit',
      default: 5,
      placeholder: '5',
      validation: { min: 0 },
    },
    retryDelay: {
      type: 'string',
      label: 'Retry Delay',
      default: '10 seconds',
      placeholder: '10 seconds',
      validation: { format: 'duration' },
    },
    backoff: {
      type: 'select',
      label: 'Backoff',
      default: 'exponential',
      options: ['exponential', 'linear', 'constant'],
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      placeholder: '10 minutes',
      description: 'Per-attempt timeout.',
      validation: { format: 'duration' },
    },
  },
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
