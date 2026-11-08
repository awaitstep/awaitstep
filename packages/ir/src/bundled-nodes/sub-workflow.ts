import type { NodeDefinition } from '../node-definition.js'

export const subWorkflowDefinition: NodeDefinition = {
  id: 'sub_workflow',
  name: 'Sub-Workflow',
  version: '1.0.0',
  description: 'Call another deployed workflow, optionally waiting for completion.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    workflowId: {
      type: 'string',
      label: 'Workflow',
      required: true,
      description: 'The target workflow’s AwaitStep id or deployed name.',
      placeholder: 'onboarding-workflow',
    },
    workflowName: {
      type: 'string',
      label: 'Export name',
      description:
        'Provider export name, where the provider has one (Cloudflare: the exported workflow class).',
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
    params: {
      type: 'json',
      label: 'Provider params',
      description:
        'Provider-scoped settings, e.g. { "cf": { "binding": "ONBOARDING_WORKFLOW" } }. Other providers read their own key.',
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
