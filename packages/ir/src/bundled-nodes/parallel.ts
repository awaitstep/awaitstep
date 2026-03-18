import type { NodeDefinition } from '../node-definition.js'

export const parallelDefinition: NodeDefinition = {
  id: 'parallel',
  name: 'Parallel',
  version: '1.0.0',
  description: 'Run multiple paths concurrently.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
