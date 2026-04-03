#!/usr/bin/env npx tsx
/**
 * Builds registry/index.json from the registry/nodes/ directory.
 * Run: npx tsx registry/scripts/build-index.ts
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { nodeDefinitionSchema } from '@awaitstep/ir'
import type { NodeDefinition, Provider } from '@awaitstep/ir'
import { deepMerge } from './merge.js'

interface RegistryVersionEntry {
  version: string
  checksum: string
  publishedAt: string
  deprecated?: boolean
}

interface RegistryNodeEntry {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  icon?: string
  author: string
  license: string
  providers: Provider[]
  latest: string
  versions: RegistryVersionEntry[]
}

interface RegistryIndex {
  version: number
  generatedAt: string
  nodes: RegistryNodeEntry[]
}

const NODES_DIR = join(import.meta.dirname, '..', 'nodes')

async function getDirectories(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

async function loadDefinition(
  nodeDir: string,
  versionDir: string,
): Promise<Record<string, unknown>> {
  const basePath = join(nodeDir, 'base.json')
  const overridesPath = join(versionDir, 'overrides.json')
  const nodePath = join(versionDir, 'node.json')

  if (await fileExists(basePath)) {
    const base = JSON.parse(await readFile(basePath, 'utf-8'))
    let merged: Record<string, unknown>
    if (await fileExists(overridesPath)) {
      merged = deepMerge(base, JSON.parse(await readFile(overridesPath, 'utf-8')))
    } else if (await fileExists(nodePath)) {
      return JSON.parse(await readFile(nodePath, 'utf-8'))
    } else {
      throw new Error(`No overrides.json or node.json found in ${versionDir}`)
    }
    await writeFile(nodePath, JSON.stringify(merged, null, 2) + '\n')
    return merged
  }

  return JSON.parse(await readFile(nodePath, 'utf-8'))
}

async function buildNodeEntry(nodeId: string): Promise<RegistryNodeEntry> {
  const nodeDir = join(NODES_DIR, nodeId)
  const versionDirs = (await getDirectories(nodeDir)).sort()

  if (versionDirs.length === 0) {
    throw new Error(`Node ${nodeId} has no version directories`)
  }

  const versions: RegistryVersionEntry[] = []
  let latestDef: NodeDefinition | null = null

  for (const version of versionDirs) {
    const versionDir = join(nodeDir, version)
    const parsed = await loadDefinition(nodeDir, versionDir)

    // Validate against the shared schema
    const result = nodeDefinitionSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
      throw new Error(`Validation failed for ${nodeId}@${version}:\n${issues.join('\n')}`)
    }
    // Use raw parsed object for checksum (preserves original key order)
    // Zod validation above ensures correctness, but reorders keys
    const definition = parsed as NodeDefinition

    if (definition.id !== nodeId) {
      throw new Error(`Node ID mismatch: directory ${nodeId}, definition ${definition.id}`)
    }
    if (definition.version !== version) {
      throw new Error(
        `Version mismatch for ${nodeId}: directory ${version}, definition ${definition.version}`,
      )
    }

    // Read templates
    const templates: Partial<Record<Provider, string>> = {}
    for (const provider of definition.providers) {
      try {
        templates[provider] = await readFile(
          join(versionDir, 'templates', `${provider}.ts`),
          'utf-8',
        )
      } catch {
        try {
          templates[provider] = await readFile(join(versionDir, 'template.ts'), 'utf-8')
        } catch {
          throw new Error(`No template found for ${nodeId}@${version} provider ${provider}`)
        }
      }
    }

    // Compute checksum (same algorithm as node-cli and remote-node-registry client)
    const checksumInput = JSON.stringify({ definition, templates })
    const hash = createHash('sha256').update(checksumInput).digest('hex')

    versions.push({
      version,
      checksum: `sha256:${hash}`,
      publishedAt: new Date().toISOString(),
      deprecated: definition.deprecated,
    })

    latestDef = definition
  }

  const latest = versionDirs[versionDirs.length - 1]

  return {
    id: nodeId,
    name: latestDef!.name,
    description: latestDef!.description,
    category: latestDef!.category,
    tags: latestDef!.tags ?? [],
    icon: latestDef!.icon,
    author: latestDef!.author,
    license: latestDef!.license,
    providers: latestDef!.providers,
    latest,
    versions,
  }
}

async function main() {
  const nodeIds = await getDirectories(NODES_DIR)
  console.log(`Found ${nodeIds.length} nodes: ${nodeIds.join(', ')}`)

  const nodes: RegistryNodeEntry[] = []
  for (const nodeId of nodeIds.sort()) {
    console.log(`  Processing ${nodeId}...`)
    nodes.push(await buildNodeEntry(nodeId))
  }

  const index: RegistryIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    nodes,
  }

  const outputPath = join(import.meta.dirname, '..', 'index.json')
  await writeFile(outputPath, JSON.stringify(index, null, 2) + '\n')
  console.log(`\nWrote index.json with ${nodes.length} nodes`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
