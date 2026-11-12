import { access } from 'node:fs/promises'
import { join } from 'node:path'
import {
  loadNodeSources,
  loadTemplates,
  mergeDefinition,
  type NodeSource,
} from './lib/definition.js'
import {
  validateNode,
  type DefinitionSchema,
  type ValidationIssue,
  type VersionInput,
} from './lib/validate-node.js'

const NODES_DIR = join(import.meta.dirname, '..', 'nodes')

async function loadSchema(): Promise<DefinitionSchema> {
  try {
    const ir = await import('@awaitstep/ir')
    return ir.nodeDefinitionSchema as DefinitionSchema
  } catch {
    // Local static checks run before packages are built; use the source schema.
    const ir = await import('../../packages/ir/src/index.ts')
    return ir.nodeDefinitionSchema as DefinitionSchema
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function versionInput(source: NodeSource, version: NodeSource['versions'][number]) {
  const definition =
    source.base && version.overrides
      ? mergeDefinition(source.base, version.overrides)
      : version.node
  const providers = Array.isArray(definition?.providers)
    ? definition.providers.filter((value): value is string => typeof value === 'string')
    : []
  const loaded = await loadTemplates(version.dir, providers)
  const templates = Object.fromEntries(
    Object.entries(loaded).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const input: VersionInput = {
    version: version.version,
    overrides: version.overrides,
    node: version.node,
    templates,
  }
  return input
}

async function main() {
  const sources = await loadNodeSources(NODES_DIR)
  const schema = await loadSchema()
  const issues: ValidationIssue[] = []

  for (const source of sources) {
    const versions = await Promise.all(
      source.versions.map((version) => versionInput(source, version)),
    )
    issues.push(
      ...validateNode(
        {
          id: source.id,
          base: source.base,
          versions,
          iconExists: await exists(join(source.dir, 'icon.svg')),
        },
        schema,
      ),
    )
  }

  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')

  for (const issue of errors) {
    console.error(`error ${issue.path}: ${issue.message}`)
  }
  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s) (stale generated node.json files are expected)`)
    for (const issue of warnings.slice(0, 5)) {
      console.warn(`warning ${issue.path}: ${issue.message}`)
    }
    if (warnings.length > 5) console.warn('...')
  }

  console.log(
    `validated ${sources.length} node(s), ${sources.reduce((total, node) => total + node.versions.length, 0)} version(s): ${errors.length} error(s), ${warnings.length} warning(s)`,
  )
  if (errors.length > 0) process.exit(1)
}

main().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
