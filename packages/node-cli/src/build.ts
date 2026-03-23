import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bundledNodeDefinitions } from '@awaitstep/ir'
import type { NodeBundle, NodeDefinition } from '@awaitstep/ir'

export interface NodeRegistry {
  definitions: NodeDefinition[]
  templates: Record<string, Record<string, string>>
}

export interface BuildResult {
  outputPath: string
  totalNodes: number
  builtinCount: number
  customCount: number
  error?: string
}

export async function build(nodesDir: string): Promise<BuildResult> {
  const definitions: NodeDefinition[] = [...bundledNodeDefinitions]
  const templates: Record<string, Record<string, string>> = {}

  // Load custom nodes from nodes.local.json
  const localPath = join(nodesDir, 'nodes.local.json')
  let customCount = 0

  try {
    const raw = await readFile(localPath, 'utf-8')
    const bundles = JSON.parse(raw) as NodeBundle[]

    for (const bundle of bundles) {
      definitions.push(bundle.definition)
      const providerTemplates: Record<string, string> = {}
      for (const [provider, source] of Object.entries(bundle.templates)) {
        if (source) providerTemplates[provider] = source
      }
      templates[bundle.definition.id] = providerTemplates
      customCount++
    }
  } catch {
    // No local nodes — that's fine, just use builtins
  }

  const registry: NodeRegistry = { definitions, templates }
  const outputPath = join(nodesDir, 'registry.json')
  await writeFile(outputPath, JSON.stringify(registry, null, 2) + '\n')

  return {
    outputPath,
    totalNodes: definitions.length,
    builtinCount: bundledNodeDefinitions.length,
    customCount,
  }
}
