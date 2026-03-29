import type { NodeDefinition } from '../node-definition.js'

export const breakDefinition: NodeDefinition = {
  id: 'break',
  name: 'Exit',
  version: '1.0.0',
  description:
    'Exit a loop (break) or stop workflow execution (return), optionally based on a condition.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    condition: {
      type: 'expression',
      label: 'Condition',
      description:
        'Optional JS expression — breaks only when truthy. Leave empty for unconditional break.',
      placeholder: 'poll_result.status === "complete"',
    },
  },
  outputSchema: {},
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
