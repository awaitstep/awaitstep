import type { NodeDefinition } from '@awaitstep/ir'

/** A Library node published in this project (v1.0.1) with one required field. */
export const SAY_HELLO = {
  id: 'custom:hello',
  name: 'Say hello',
  version: '1.0.1',
  description: 'Greets someone',
  category: 'Utilities',
  author: 'custom',
  license: 'UNLICENSED',
  providers: ['cloudflare'],
  configSchema: {
    target: { type: 'string', label: 'Who to greet', required: true },
    greeting: { type: 'string', label: 'Greeting', default: 'Hello' },
  },
  outputSchema: {},
  runtime: { defaultRetries: 2, defaultTimeout: '30 seconds' },
} as unknown as NodeDefinition

/** An installed marketplace node. */
export const RESEND = {
  id: 'resend',
  name: 'Resend',
  version: '2.0.0',
  description: 'Send email',
  category: 'Email',
  author: 'awaitstep',
  license: 'MIT',
  providers: ['cloudflare'],
  configSchema: {},
  outputSchema: {},
} as unknown as NodeDefinition

/** A builtin, which Add → Custom node must not list. */
export const SLEEP = {
  id: 'sleep',
  name: 'Sleep',
  version: '1.0.0',
  description: 'Wait',
  category: 'Scheduling',
  author: 'awaitstep',
  license: 'MIT',
  providers: ['cloudflare'],
  configSchema: {},
  outputSchema: {},
} as unknown as NodeDefinition

export const TEMPLATE_DEFINITIONS = [SLEEP, SAY_HELLO, RESEND]

export const TEMPLATE_SOURCES = new Map([
  ['custom:hello', { itemId: 'hello', owner: 'project' as const, version: '1.0.1' }],
])

/** The `useNodeRegistry` value these tests mock. */
export function templateRegistry() {
  return {
    registry: {
      get: (type: string) => TEMPLATE_DEFINITIONS.find((d) => d.id === type),
      getAll: () => TEMPLATE_DEFINITIONS,
    },
    customNodes: TEMPLATE_SOURCES,
    customNodesStatus: 'ready' as const,
    refresh: () => {},
  }
}
