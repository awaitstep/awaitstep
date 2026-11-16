import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NodeRegistry, bundledNodeDefinitions, type NodeDefinition } from '@awaitstep/ir'

const REGISTRY_DIR = join(__dirname, '../../../../../../registry/nodes')

type Json = Record<string, unknown>

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf8')) as Json
}

function versionKey(version: string): number[] {
  return version.split('.').map(Number)
}

function compare(a: string, b: string): number {
  const [x, y] = [versionKey(a), versionKey(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}

/** The versions a registry node publishes, newest last. */
export function registryVersions(type: string): string[] {
  const dir = join(REGISTRY_DIR, type)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /^\d+\.\d+\.\d+$/.test(name))
    .sort(compare)
}

export function registryBase(type: string): Json {
  return readJson(join(REGISTRY_DIR, type, 'base.json'))
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The registry's merge (`registry/scripts/merge.ts`, which `src` can't
 * import): objects merge key by key at every depth, anything else replaces.
 */
function deepMerge(base: Json, overrides: Json): Json {
  const result: Json = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = isRecord(value) && isRecord(result[key]) ? deepMerge(result[key], value) : value
  }
  return result
}

/** One version's definition, merged as the registry builds its `node.json`. */
export function registryDefinition(type: string, version: string): NodeDefinition {
  const overrides = readJson(join(REGISTRY_DIR, type, version, 'overrides.json'))
  // The registry's JSON is the definition's source; this test reads it as one, unchecked.
  const definition: unknown = {
    providers: ['cloudflare'],
    ...deepMerge(registryBase(type), overrides),
  }
  return definition as NodeDefinition
}

export function registryTemplate(type: string, version: string): string | undefined {
  const path = join(REGISTRY_DIR, type, version, 'template.ts')
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** The app's node registry: the bundled nodes, plus the given registry nodes at the given versions. */
export function installedRegistry(nodes: Record<string, string> = {}): NodeRegistry {
  const registry = new NodeRegistry()
  for (const definition of bundledNodeDefinitions) registry.register(definition)
  for (const [type, version] of Object.entries(nodes)) {
    registry.register(registryDefinition(type, version))
  }
  return registry
}
