import type { NodeDefinition } from '../node-definition.js'

export const raceDefinition: NodeDefinition = {
  id: 'race',
  name: 'Race',
  version: '1.0.0',
  description: 'Run multiple paths concurrently — first to complete wins.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {},
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
