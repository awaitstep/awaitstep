import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeBundle } from '@awaitstep/ir'
import { build } from '../build.js'
import type { NodeRegistry } from '../build.js'

function makeBundle(id: string): NodeBundle {
  return {
    definition: {
      id,
      name: id.replace(/_/g, ' '),
      version: '1.0.0',
      description: `A ${id} node`,
      category: 'Utilities',
      author: 'test',
      license: 'MIT',
      configSchema: {
        url: { type: 'string', label: 'URL', required: true },
      },
      outputSchema: {
        result: { type: 'object' },
      },
      providers: ['cloudflare'],
    },
    templates: {
      cloudflare: 'export default async function(ctx) { return await fetch(ctx.config.url); }',
    },
    bundledAt: '2026-03-19T12:00:00Z',
    checksum: 'sha256:' + 'a'.repeat(64),
  }
}

describe('build', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'node-cli-build-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('produces registry.json with only builtins when no local nodes exist', async () => {
    const result = await build(tmpDir)

    expect(result.builtinCount).toBe(bundledNodeDefinitions.length)
    expect(result.customCount).toBe(0)
    expect(result.totalNodes).toBe(bundledNodeDefinitions.length)

    const registry: NodeRegistry = JSON.parse(await readFile(result.outputPath, 'utf-8'))
    expect(registry.definitions).toHaveLength(bundledNodeDefinitions.length)
    expect(registry.templates).toEqual({})
  })

  it('merges builtin + custom nodes into registry.json', async () => {
    const bundles = [makeBundle('webhook_post'), makeBundle('slack_message')]
    await writeFile(join(tmpDir, 'nodes.local.json'), JSON.stringify(bundles))

    const result = await build(tmpDir)

    expect(result.builtinCount).toBe(bundledNodeDefinitions.length)
    expect(result.customCount).toBe(2)
    expect(result.totalNodes).toBe(bundledNodeDefinitions.length + 2)

    const registry: NodeRegistry = JSON.parse(await readFile(result.outputPath, 'utf-8'))
    expect(registry.definitions).toHaveLength(bundledNodeDefinitions.length + 2)

    const ids = registry.definitions.map((d) => d.id)
    expect(ids).toContain('step')
    expect(ids).toContain('webhook_post')
    expect(ids).toContain('slack_message')
  })

  it('includes templates for custom nodes', async () => {
    const bundles = [makeBundle('webhook_post')]
    await writeFile(join(tmpDir, 'nodes.local.json'), JSON.stringify(bundles))

    const result = await build(tmpDir)
    const registry: NodeRegistry = JSON.parse(await readFile(result.outputPath, 'utf-8'))

    expect(registry.templates['webhook_post']).toBeDefined()
    expect(registry.templates['webhook_post']['cloudflare']).toContain('fetch(ctx.config.url)')
  })

  it('does not include templates for builtin nodes', async () => {
    const result = await build(tmpDir)
    const registry: NodeRegistry = JSON.parse(await readFile(result.outputPath, 'utf-8'))

    expect(registry.templates['step']).toBeUndefined()
    expect(registry.templates['sleep']).toBeUndefined()
  })

  it('writes to the correct output path', async () => {
    const result = await build(tmpDir)
    expect(result.outputPath).toBe(join(tmpDir, 'registry.json'))
  })
})
