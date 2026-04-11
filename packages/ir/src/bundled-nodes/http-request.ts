import type { NodeDefinition } from '../node-definition.js'

export const httpRequestDefinition: NodeDefinition = {
  id: 'http_request',
  name: 'HTTP Request',
  version: '1.0.0',
  description: 'Make an HTTP API call.',
  category: 'HTTP',
  author: 'awaitstep',
  license: 'Apache-2.0',
  configSchema: {
    method: {
      type: 'select',
      label: 'Method',
      required: true,
      default: 'GET',
      options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    },
    url: {
      type: 'string',
      label: 'URL',
      required: true,
      placeholder: 'https://api.example.com/data',
      validation: { format: 'url' },
    },
    headers: {
      type: 'json',
      label: 'Headers',
      description: 'JSON object of request headers.',
    },
    queryParams: {
      type: 'json',
      label: 'Query Parameters',
      description: 'JSON object of URL query parameters.',
    },
    body: {
      type: 'code',
      label: 'Body',
      description: 'Request body. Only used for POST, PUT, PATCH.',
    },
    retryLimit: {
      type: 'number',
      label: 'Retry Limit',
      default: 5,
      placeholder: '5',
      validation: { min: 0 },
    },
    timeout: {
      type: 'string',
      label: 'Timeout',
      placeholder: '10 minutes',
      validation: { format: 'duration' },
    },
  },
  outputSchema: {
    status: { type: 'number', description: 'HTTP status code' },
    body: { type: 'string', description: 'Response body as text' },
    headers: { type: 'object', description: 'Response headers' },
  },
  providers: ['cloudflare', 'inngest', 'temporal', 'stepfunctions'],
}
