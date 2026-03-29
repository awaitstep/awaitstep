import type { NodeDefinition } from '../node-definition.js'

export const loopDefinition: NodeDefinition = {
  id: 'loop',
  name: 'Loop',
  version: '1.0.0',
  description: 'Repeat steps using forEach, while, or a fixed count.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    loopType: {
      type: 'select',
      label: 'Loop Type',
      required: true,
      default: 'forEach',
      options: ['forEach', 'while', 'times'],
    },
    collection: {
      type: 'expression',
      label: 'Collection',
      description: 'Expression resolving to an array (forEach only).',
      placeholder: '{{get_customers.customers}}',
    },
    itemVar: {
      type: 'string',
      label: 'Item Variable',
      description: 'Variable name for the current item (forEach only).',
      default: 'item',
      placeholder: 'item',
    },
    indexVar: {
      type: 'string',
      label: 'Index Variable',
      description: 'Variable name for the current index (forEach only).',
      default: 'i',
      placeholder: 'i',
    },
    condition: {
      type: 'expression',
      label: 'Condition',
      description: 'JS expression — loop continues while truthy (while only).',
      placeholder: 'status !== "done"',
    },
    count: {
      type: 'number',
      label: 'Count',
      description: 'Number of iterations (times only).',
      default: 5,
      validation: { min: 1 },
    },
  },
  outputSchema: {
    results: {
      type: 'array',
      description: 'Collected results from each iteration.',
    },
  },
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
