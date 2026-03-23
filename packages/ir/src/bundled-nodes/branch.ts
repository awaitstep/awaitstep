import type { NodeDefinition } from '../node-definition.js'

export const branchDefinition: NodeDefinition = {
  id: 'branch',
  name: 'Branch',
  version: '1.0.0',
  description: 'Conditional logic with multiple paths.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
