import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { nodeDefinitionSchema } from '@awaitstep/ir'
import type { NodeBundle, NodeDefinition } from '@awaitstep/ir'

const BUILTIN_IDS = new Set([
  'step',
  'sleep',
  'sleep_until',
  'branch',
  'parallel',
  'http_request',
  'wait_for_event',
])

interface GenerateResult {
  bundles: NodeBundle[]
  outputPath: string
  errors: Array<{ nodeId: string; error: string }>
}

export async function generate(nodesDir: string): Promise<GenerateResult> {
  const bundles: NodeBundle[] = []
  const errors: Array<{ nodeId: string; error: string }> = []

  let entries: string[]
  try {
    entries = await readdir(nodesDir)
  } catch {
    return { bundles, outputPath: '', errors: [{ nodeId: '', error: `Cannot read directory: ${nodesDir}` }] }
  }

  // Find subdirectories (each is a node)
  const nodeDirs: string[] = []
  for (const entry of entries) {
    const entryPath = join(nodesDir, entry)
    const s = await stat(entryPath).catch(() => null)
    if (s?.isDirectory()) nodeDirs.push(entry)
  }

  for (const dirName of nodeDirs) {
    const result = await processNode(nodesDir, dirName)
    if (result.error) {
      errors.push({ nodeId: dirName, error: result.error })
    } else if (result.bundle) {
      bundles.push(result.bundle)
    }
  }

  if (errors.length > 0) {
    return { bundles: [], outputPath: '', errors }
  }

  if (bundles.length === 0) {
    return { bundles: [], outputPath: '', errors: [{ nodeId: '', error: 'No custom nodes found' }] }
  }

  const outputPath = join(nodesDir, 'nodes.local.json')
  await writeFile(outputPath, JSON.stringify(bundles, null, 2) + '\n')

  return { bundles, outputPath, errors: [] }
}

async function processNode(
  nodesDir: string,
  dirName: string,
): Promise<{ bundle?: NodeBundle; error?: string }> {
  const nodeDir = join(nodesDir, dirName)
  const definitionPath = join(nodeDir, 'node.json')

  // Read and parse node.json
  let raw: string
  try {
    raw = await readFile(definitionPath, 'utf-8')
  } catch {
    return { error: 'Missing node.json' }
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { error: 'node.json is not valid JSON' }
  }

  // Validate against schema
  const result = nodeDefinitionSchema.safeParse(data)
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    return { error: `Validation failed:\n  ${messages.join('\n  ')}` }
  }

  const definition = result.data as NodeDefinition

  // Check id matches directory name
  if (definition.id !== dirName) {
    return { error: `id "${definition.id}" does not match directory name "${dirName}"` }
  }

  // Check not a builtin
  if (BUILTIN_IDS.has(definition.id)) {
    return { error: `"${definition.id}" conflicts with a builtin node type` }
  }

  // Validate secret fields have envVarName
  for (const [fieldName, field] of Object.entries(definition.configSchema)) {
    if (field.type === 'secret' && !field.envVarName) {
      return { error: `configSchema.${fieldName}: secret field must have envVarName` }
    }
    if ((field.type === 'select' || field.type === 'multiselect') && (!field.options || field.options.length === 0)) {
      return { error: `configSchema.${fieldName}: ${field.type} field must have non-empty options` }
    }
  }

  // Read templates — try provider-specific file first, fall back to template.ts
  const templates: Record<string, string> = {}
  let defaultTemplate: string | null = null
  try {
    defaultTemplate = await readFile(join(nodeDir, 'template.ts'), 'utf-8')
  } catch {
    // no default template
  }

  for (const provider of definition.providers) {
    const providerPath = join(nodeDir, 'templates', `${provider}.ts`)
    try {
      templates[provider] = await readFile(providerPath, 'utf-8')
    } catch {
      if (defaultTemplate) {
        templates[provider] = defaultTemplate
      } else {
        return { error: `Missing template: provide templates/${provider}.ts or a shared template.ts` }
      }
    }
  }

  // Compute checksum over definition + templates
  const checksumInput = JSON.stringify({ definition, templates })
  const hash = createHash('sha256').update(checksumInput).digest('hex')

  const bundle: NodeBundle = {
    definition,
    templates,
    bundledAt: new Date().toISOString(),
    checksum: `sha256:${hash}`,
  }

  return { bundle }
}
