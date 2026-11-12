#!/usr/bin/env tsx
/**
 * Builds registry/index.json from registry/nodes/.
 *
 * CI only. Never run locally: it rewrites the generated node.json files and
 * index.json, which the registry-index workflow owns.
 *
 * Run: pnpm --filter @awaitstep/registry build-index
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { nodeBundleChecksumInput, nodeDefinitionSchema } from '@awaitstep/ir'
import type { NodeDefinition, Provider } from '@awaitstep/ir'
import {
  latestVersion,
  loadNodeSources,
  loadTemplates,
  mergeDefinition,
  sortVersions,
  type NodeSource,
} from './lib/definition.js'

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
const INDEX_PATH = join(import.meta.dirname, '..', 'index.json')

async function loadPreviousIndex(): Promise<Map<string, RegistryVersionEntry>> {
  const entries = new Map<string, RegistryVersionEntry>()
  try {
    const raw = JSON.parse(await readFile(INDEX_PATH, 'utf-8')) as RegistryIndex
    for (const node of raw.nodes) {
      for (const version of node.versions) {
        entries.set(`${node.id}@${version.version}`, version)
      }
    }
  } catch {
    // No previous index, or it is unreadable: every version is new.
  }
  return entries
}

async function buildNodeEntry(
  source: NodeSource,
  previous: Map<string, RegistryVersionEntry>,
): Promise<RegistryNodeEntry> {
  if (source.versions.length === 0) throw new Error(`Node ${source.id} has no version directories`)

  const versions: RegistryVersionEntry[] = []
  let latestDef: NodeDefinition | null = null
  const now = new Date().toISOString()

  for (const version of sortVersions(source.versions)) {
    let parsed: Record<string, unknown>
    if (source.base && version.overrides) {
      parsed = mergeDefinition(source.base, version.overrides)
      await writeFile(join(version.dir, 'node.json'), JSON.stringify(parsed, null, 2) + '\n')
    } else if (version.node) {
      parsed = version.node
    } else {
      throw new Error(`Node ${source.id}@${version.version} has no definition`)
    }

    const result = nodeDefinitionSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues.map(
        (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
      )
      throw new Error(
        `Validation failed for ${source.id}@${version.version}:\n${issues.join('\n')}`,
      )
    }
    const definition = parsed as unknown as NodeDefinition

    if (definition.id !== source.id) {
      throw new Error(`Node ID mismatch: directory ${source.id}, definition ${definition.id}`)
    }
    if (definition.version !== version.version) {
      throw new Error(
        `Version mismatch for ${source.id}: directory ${version.version}, definition ${definition.version}`,
      )
    }

    const templates = await loadTemplates(version.dir, definition.providers)
    for (const provider of definition.providers) {
      if (!templates[provider]) {
        throw new Error(
          `No template found for ${source.id}@${version.version} provider ${provider}`,
        )
      }
    }

    const checksumInput = nodeBundleChecksumInput(definition, templates)
    const hash = createHash('sha256').update(checksumInput).digest('hex')
    const checksum = `sha256:${hash}`
    const previousEntry = previous.get(`${source.id}@${version.version}`)
    versions.push({
      version: version.version,
      checksum,
      publishedAt: previousEntry?.publishedAt ?? now,
      deprecated: definition.deprecated,
    })

    latestDef = definition
  }

  const latest = latestVersion(versions)
  if (!latest || !latestDef) throw new Error(`Node ${source.id} has no latest version`)

  return {
    id: source.id,
    name: latestDef.name,
    description: latestDef.description,
    category: latestDef.category,
    tags: latestDef.tags ?? [],
    icon: latestDef.icon,
    author: latestDef.author,
    license: latestDef.license,
    providers: latestDef.providers,
    latest,
    versions,
  }
}

async function main() {
  const sources = await loadNodeSources(NODES_DIR)
  const previous = await loadPreviousIndex()
  console.log(`Found ${sources.length} nodes: ${sources.map((source) => source.id).join(', ')}`)

  const nodes: RegistryNodeEntry[] = []
  for (const source of sources) {
    console.log(`  Processing ${source.id}...`)
    nodes.push(await buildNodeEntry(source, previous))
  }

  const index: RegistryIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    nodes,
  }
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')
  console.log(`\nWrote index.json with ${nodes.length} nodes`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
