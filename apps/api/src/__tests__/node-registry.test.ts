import { describe, expect, it } from 'vitest'
import type { NodeDefinition } from '@awaitstep/ir'
import {
  buildNodeRegistry,
  createMergedNodeRegistry,
  withExtensionNodes,
} from '../lib/node-registry.js'

describe('node template resolution', () => {
  const registry = buildNodeRegistry({
    definitions: [],
    templates: { custom: { cloudflare: 'export const value = 1' } },
  })

  it('does not fall back to another provider when one is named', () => {
    expect(registry.templateResolver.getTemplate('custom', 'inngest')).toBeUndefined()
  })

  it('does not resolve prototype keys', () => {
    expect(registry.templateResolver.getTemplate('custom', '__proto__')).toBeUndefined()
    expect(registry.templateResolver.getTemplate('__proto__')).toBeUndefined()
  })

  it('uses the only template when no provider is named', () => {
    expect(registry.templateResolver.getTemplate('custom')).toBe('export const value = 1')
  })
})

describe('nodes an extension brings', () => {
  const definition = (id: string, providers = ['cloudflare']): NodeDefinition => ({
    id,
    name: id,
    version: '1.0.0',
    description: 'A node',
    category: 'Database',
    author: 'test',
    license: 'MIT',
    configSchema: {},
    outputSchema: {},
    providers,
  })
  const base = buildNodeRegistry({
    definitions: [definition('built_in')],
    templates: { built_in: { cloudflare: 'export default 1' } },
  })
  const bring = (
    id: string,
    templates: Record<string, string> = { cloudflare: 'export default 2' },
  ) => ({
    definition: definition(id, ['managed']),
    templates,
  })

  it('keeps its node when an installed or custom node takes the same id', () => {
    const withNode = withExtensionNodes(base, [{ id: 'cloud', nodes: [bring('database_query')] }])!
    const impostor = definition('database_query')
    const merged = createMergedNodeRegistry(
      withNode,
      [
        {
          bundle: JSON.stringify({
            definition: impostor,
            templates: { cloudflare: 'export default "installed"', managed: 'export default "x"' },
          }),
        } as never,
        {
          bundle: JSON.stringify({
            definition: definition('other'),
            templates: { cloudflare: 'export default "other"' },
          }),
        } as never,
      ],
      [{ definition: impostor, template: 'export default "custom"' }],
    )
    expect(merged.templateResolver.getTemplate('database_query', 'cloudflare')).toBe(
      'export default 2',
    )
    expect(merged.templateResolver.getTemplate('database_query', 'managed')).toBeUndefined()
    expect(merged.registry.get('database_query')?.providers).toEqual(['managed'])
    // Any other installed node is taken as before, and the protection carries to the next merge.
    expect(merged.templateResolver.getTemplate('other', 'cloudflare')).toBe(
      'export default "other"',
    )
    expect(merged.reserved?.has('database_query')).toBe(true)
  })

  it('leaves the registry as it was when no extension brings one', () => {
    expect(withExtensionNodes(base, [{ id: 'a' }, { id: 'b', nodes: [] }])).toBe(base)
    expect(withExtensionNodes(undefined, [{ id: 'a' }])).toBeUndefined()
  })

  it('adds them beside the built-in ones, with their templates and providers', () => {
    const merged = withExtensionNodes(base, [{ id: 'cloud', nodes: [bring('query')] }])!
    expect(merged.registry.getAll().map((d) => d.id)).toEqual(['built_in', 'query'])
    expect(merged.registry.get('query')?.providers).toEqual(['managed'])
    expect(merged.templateResolver.getTemplate('query', 'cloudflare')).toBe('export default 2')
    expect(merged.templateResolver.getTemplate('built_in', 'cloudflare')).toBe('export default 1')
    // The registry it was built from is not changed.
    expect(base.registry.get('query')).toBeUndefined()
    expect(base.templates['query']).toBeUndefined()
  })

  it('builds a registry where the instance had none', () => {
    const merged = withExtensionNodes(undefined, [{ id: 'cloud', nodes: [bring('query')] }])!
    expect(merged.registry.getAll().map((d) => d.id)).toEqual(['query'])
  })

  it.each([
    ['a built-in id', [{ id: 'cloud', nodes: [bring('built_in')] }], 'already registered'],
    [
      'an id two extensions bring',
      [
        { id: 'one', nodes: [bring('query')] },
        { id: 'two', nodes: [bring('query')] },
      ],
      'Extension "two" brings a node "query" that is already registered',
    ],
    ['a node with no template', [{ id: 'cloud', nodes: [bring('query', {})] }], 'no template'],
    [
      'a node whose only template is empty',
      [{ id: 'cloud', nodes: [bring('query', { cloudflare: '' })] }],
      'no template',
    ],
    [
      'a definition the schema refuses',
      [{ id: 'cloud', nodes: [{ ...bring('query'), definition: definition('Bad Id') }] }],
      'invalid definition',
    ],
    [
      'an id that is a prototype key',
      [{ id: 'cloud', nodes: [bring('__proto__')] }],
      'invalid definition',
    ],
  ])('refuses %s at startup', (_name, extensions, message) => {
    expect(() => withExtensionNodes(base, extensions)).toThrow(message)
  })
})
