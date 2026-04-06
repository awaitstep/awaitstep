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
      label: 'Script Name',
      required: true,
      description: 'The deployed worker name (e.g. awaitstep-abc123 or my-worker).',
      placeholder: 'awaitstep-abc123',
    },
    workflowName: {
      type: 'string',
      label: 'Class Name',
      required: true,
      description:
        'The exported workflow class name in the child worker (e.g. OnboardingWorkflow).',
      placeholder: 'OnboardingWorkflow',
    },
    input: {
      type: 'code',
      label: 'Input',
      description: 'Expression for params passed to the child workflow.',
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
