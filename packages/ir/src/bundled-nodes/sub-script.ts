import type { NodeDefinition } from '../node-definition.js'

/**
 * Calls another deployed Worker (kind: 'script') via a Cloudflare service
 * binding. Same datacenter, no public network round-trip. Generates an
 * `env.<BINDING>.fetch(url, { method, headers, body })` call wrapped in a
 * step.do (workflow mode) or a bare await (script mode).
 *
 * The user supplies the deployed worker name (free text, like sub_workflow's
 * workflowId). The env binding name is auto-derived: `awaitstep-my-script` →
 * `MY_SCRIPT`.
 */
export const subScriptDefinition: NodeDefinition = {
  id: 'sub_script',
  name: 'Call Script',
  version: '1.0.0',
  description: 'Call another deployed script via Cloudflare service binding.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    workerName: {
      type: 'string',
      label: 'Worker Name',
      required: true,
      description: 'The deployed worker name (e.g. awaitstep-my-script).',
      placeholder: 'awaitstep-my-script',
    },
    method: {
      type: 'select',
      label: 'Method',
      required: true,
      default: 'POST',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
    url: {
      type: 'string',
      label: 'URL',
      required: true,
      default: 'https://invoke/',
      placeholder: 'https://invoke/',
      description:
        'Placeholder URL — service-binding calls bypass DNS, but the called worker sees this as request.url for routing.',
    },
    headers: {
      type: 'json',
      label: 'Headers',
      description: 'JSON object of request headers.',
    },
    body: {
      type: 'code',
      label: 'Body',
      description: 'Request body. Used for POST/PUT/PATCH. Stringified as JSON if not a string.',
    },
    retryLimit: {
      type: 'number',
      label: 'Retry Limit',
      default: 3,
      placeholder: '3',
      validation: { min: 0 },
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      placeholder: '5 minutes',
      validation: { format: 'duration' },
    },
  },
  outputSchema: {
    status: { type: 'number', description: 'HTTP status code' },
    body: { type: 'string', description: 'Response body as text' },
    headers: { type: 'object', description: 'Response headers' },
  },
  providers: ['cloudflare'],
}
