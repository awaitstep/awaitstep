import type { NodeDefinition } from '../node-definition.js'

export const subWorkflowDefinition: NodeDefinition = {
  id: 'sub_workflow',
  name: 'Sub-Workflow',
  version: '1.0.0',
  description: 'Trigger another workflow by ID, optionally waiting for completion.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    workflowId: {
      type: 'string',
      label: 'Workflow ID',
      required: true,
      placeholder: 'wf_abc123',
    },
    workflowName: {
      type: 'string',
      label: 'Workflow Name',
      required: true,
      description: 'Human-readable name used for the CF binding.',
      placeholder: 'order-fulfillment',
    },
    input: {
      type: 'expression',
      label: 'Input',
      description: 'Expression for params passed to the child workflow.',
      placeholder: '{{ charge_result }}',
    },
    waitForCompletion: {
      type: 'boolean',
      label: 'Wait for Completion',
      description: 'Block until the child workflow finishes.',
      default: true,
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      description: 'Max time to wait for child completion (e.g. "5 minutes").',
      default: '5 minutes',
      placeholder: '5 minutes',
      validation: { format: 'duration' },
    },
  },
  outputSchema: {
    instanceId: {
      type: 'string',
      description: 'The child workflow instance ID.',
    },
  },
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
