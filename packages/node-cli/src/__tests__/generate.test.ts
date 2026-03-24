import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generate } from '../generate.js'

function makeDefinition(id: string, overrides?: Record<string, unknown>) {
  return {
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
    ...overrides,
  }
}

const sampleTemplate = `export default async function(ctx) {
  const response = await fetch(ctx.config.url);
  return response.json();
}`

async function setupNode(
  nodesDir: string,
  id: string,
  definition?: Record<string, unknown>,
  template?: string,
) {
  const nodeDir = join(nodesDir, id)
  await mkdir(join(nodeDir, 'templates'), { recursive: true })
  await writeFile(join(nodeDir, 'node.json'), JSON.stringify(definition ?? makeDefinition(id)))
  await writeFile(join(nodeDir, 'templates', 'cloudflare.ts'), template ?? sampleTemplate)
}

async function setupNodeWithSharedTemplate(
  nodesDir: string,
  id: string,
  definition?: Record<string, unknown>,
  template?: string,
) {
  const nodeDir = join(nodesDir, id)
  await mkdir(nodeDir, { recursive: true })
  await writeFile(join(nodeDir, 'node.json'), JSON.stringify(definition ?? makeDefinition(id)))
  await writeFile(join(nodeDir, 'template.ts'), template ?? sampleTemplate)
}

describe('generate', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'node-cli-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('generates nodes.local.json from valid nodes', async () => {
    await setupNode(tmpDir, 'webhook_post')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0].definition.id).toBe('webhook_post')
    expect(result.bundles[0].templates.cloudflare).toContain('fetch(ctx.config.url)')
    expect(result.bundles[0].checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(result.outputPath).toBe(join(tmpDir, 'nodes.local.json'))

    const written = JSON.parse(await readFile(result.outputPath, 'utf-8'))
    expect(written).toHaveLength(1)
    expect(written[0].definition.id).toBe('webhook_post')
  })

  it('generates multiple nodes', async () => {
    await setupNode(tmpDir, 'node_a')
    await setupNode(tmpDir, 'node_b')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles).toHaveLength(2)
  })

  it('fails if node.json is missing', async () => {
    const nodeDir = join(tmpDir, 'bad_node')
    await mkdir(nodeDir)

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].nodeId).toBe('bad_node')
    expect(result.errors[0].error).toContain('Missing node.json')
  })

  it('fails if id does not match directory name', async () => {
    const nodeDir = join(tmpDir, 'wrong_name')
    await mkdir(join(nodeDir, 'templates'), { recursive: true })
    await writeFile(join(nodeDir, 'node.json'), JSON.stringify(makeDefinition('correct_name')))
    await writeFile(join(nodeDir, 'templates', 'cloudflare.ts'), sampleTemplate)

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('does not match directory name')
  })

  it('fails if id conflicts with builtin', async () => {
    await setupNode(tmpDir, 'step')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('conflicts with a builtin')
  })

  it('fails if secret field lacks envVarName', async () => {
    await setupNode(
      tmpDir,
      'bad_secret',
      makeDefinition('bad_secret', {
        configSchema: {
          apiKey: { type: 'secret', label: 'API Key', required: true },
        },
      }),
    )

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('secret field must have envVarName')
  })

  it('fails if select field lacks options', async () => {
    await setupNode(
      tmpDir,
      'bad_select',
      makeDefinition('bad_select', {
        configSchema: {
          mode: { type: 'select', label: 'Mode' },
        },
      }),
    )

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('select field must have non-empty options')
  })

  it('fails if template file is missing', async () => {
    const nodeDir = join(tmpDir, 'no_template')
    await mkdir(nodeDir)
    await writeFile(join(nodeDir, 'node.json'), JSON.stringify(makeDefinition('no_template')))

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('Missing template')
  })

  it('fails if node.json is invalid JSON', async () => {
    const nodeDir = join(tmpDir, 'bad_json')
    await mkdir(nodeDir)
    await writeFile(join(nodeDir, 'node.json'), '{ not valid')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('not valid JSON')
  })

  it('fails if definition fails schema validation', async () => {
    const nodeDir = join(tmpDir, 'bad_schema')
    await mkdir(join(nodeDir, 'templates'), { recursive: true })
    await writeFile(join(nodeDir, 'node.json'), JSON.stringify({ id: 'bad_schema', name: '' }))
    await writeFile(join(nodeDir, 'templates', 'cloudflare.ts'), sampleTemplate)

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('Validation failed')
  })

  it('returns error for nonexistent directory', async () => {
    const result = await generate('/nonexistent/path')

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('Cannot read directory')
  })

  it('returns error when no custom nodes found', async () => {
    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('No custom nodes found')
  })

  it('uses shared template.ts when provider-specific file is missing', async () => {
    await setupNodeWithSharedTemplate(tmpDir, 'shared_node')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles).toHaveLength(1)
    expect(result.bundles[0].templates.cloudflare).toContain('fetch(ctx.config.url)')
  })

  it('uses shared template.ts for multiple providers', async () => {
    await setupNodeWithSharedTemplate(
      tmpDir,
      'multi_provider',
      makeDefinition('multi_provider', {
        providers: ['cloudflare', 'inngest'],
      }),
    )

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles[0].templates.cloudflare).toContain('fetch(ctx.config.url)')
    expect(result.bundles[0].templates.inngest).toContain('fetch(ctx.config.url)')
  })

  it('prefers provider-specific template over shared template.ts', async () => {
    const nodeDir = join(tmpDir, 'override_node')
    await mkdir(join(nodeDir, 'templates'), { recursive: true })
    await writeFile(join(nodeDir, 'node.json'), JSON.stringify(makeDefinition('override_node')))
    await writeFile(
      join(nodeDir, 'template.ts'),
      'export default async function(ctx) { return "shared"; }',
    )
    await writeFile(
      join(nodeDir, 'templates', 'cloudflare.ts'),
      'export default async function(ctx) { return "specific"; }',
    )

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles[0].templates.cloudflare).toContain('specific')
  })

  it('fails if neither provider template nor shared template exists', async () => {
    const nodeDir = join(tmpDir, 'no_template_at_all')
    await mkdir(nodeDir)
    await writeFile(
      join(nodeDir, 'node.json'),
      JSON.stringify(makeDefinition('no_template_at_all')),
    )

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].error).toContain('Missing template')
    expect(result.errors[0].error).toContain('template.ts')
  })

  it('skips non-directory entries', async () => {
    await writeFile(join(tmpDir, 'readme.md'), '# Nodes')
    await setupNode(tmpDir, 'real_node')

    const result = await generate(tmpDir)

    expect(result.errors).toHaveLength(0)
    expect(result.bundles).toHaveLength(1)
  })
})
