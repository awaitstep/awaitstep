import type { NodeDefinition } from '../node-definition.js'

/**
 * Calls another deployed function/script through the provider adapter. The
 * node is provider-neutral: generated code calls `flow.callScript(...)`, and
 * the provider's `PlatformHost` maps it to a service binding, an HTTP call, or
 * whatever its runtime uses. Provider-specific settings live under
 * `params.<provider>`; the Cloudflare adapter reads `params.cf.binding`.
 */
export const subScriptDefinition: NodeDefinition = {
  id: 'sub_script',
  name: 'Call Script',
  version: '1.0.0',
  description: 'Call another deployed function/script.',
  category: 'Control Flow',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    scriptId: {
      type: 'string',
      label: 'Script',
      required: true,
      description: 'The target script’s AwaitStep id or deployed name.',
      placeholder: 'my-script',
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
      default: 2,
      placeholder: '2',
      validation: { min: 0 },
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      placeholder: '5 minutes',
      validation: { format: 'duration' },
    },
    params: {
      type: 'json',
      label: 'Provider params',
      description:
        'Provider-scoped settings, e.g. { "cf": { "binding": "MY_SCRIPT" } }. Other providers read their own key.',
    },
  },
  outputSchema: {
    status: { type: 'number', description: 'HTTP status code' },
    body: { type: 'string', description: 'Response body as text' },
    headers: { type: 'object', description: 'Response headers' },
  },
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
