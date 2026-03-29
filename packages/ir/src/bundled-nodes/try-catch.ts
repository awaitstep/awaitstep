import type { NodeDefinition } from '../node-definition.js'

export const tryCatchDefinition: NodeDefinition = {
  id: 'try_catch',
  name: 'Try / Catch',
  version: '1.0.0',
  description: 'Wrap steps in try/catch/finally error handling.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
