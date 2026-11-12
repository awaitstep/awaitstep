import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deepMerge } from '../merge.js'

export interface VersionSource {
  version: string
  dir: string
  overrides?: Record<string, unknown>
  node?: Record<string, unknown>
}

export interface NodeSource {
  id: string
  dir: string
  base?: Record<string, unknown>
  versions: VersionSource[]
}

export function mergeDefinition(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return deepMerge(base, overrides)
}

/** Compare dotted numeric versions; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const [core, prerelease = ''] = value.split('-', 2)
    const parts = core.split('.').map((part) => Number(part))
    return { parts, prerelease }
  }
  const left = parse(a)
  const right = parse(b)
  const length = Math.max(left.parts.length, right.parts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (left.prerelease === right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease.localeCompare(right.prerelease)
}

export function sortVersions<T extends { version: string }>(versions: T[]): T[] {
  return [...versions].sort((left, right) => compareVersions(left.version, right.version))
}

export function latestVersion(versions: { version: string }[]): string | undefined {
  return sortVersions(versions).at(-1)?.version
}

export function semverProblem(version: string): string | undefined {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    return `not a semver version: ${version}`
  }
  return undefined
}

export async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(file, 'utf-8')) as Record<string, unknown>
}

export async function listDirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await readFile(file)
    return true
  } catch {
    return false
  }
}

export async function loadNodeSource(nodesDir: string, id: string): Promise<NodeSource> {
  const dir = join(nodesDir, id)
  const basePath = join(dir, 'base.json')
  const base = (await fileExists(basePath)) ? await readJson(basePath) : undefined

  const versions: VersionSource[] = []
  for (const version of await listDirectories(dir)) {
    const versionDir = join(dir, version)
    const overridesPath = join(versionDir, 'overrides.json')
    const nodePath = join(versionDir, 'node.json')
    versions.push({
      version,
      dir: versionDir,
      overrides: (await fileExists(overridesPath)) ? await readJson(overridesPath) : undefined,
      node: (await fileExists(nodePath)) ? await readJson(nodePath) : undefined,
    })
  }

  return { id, dir, base, versions: sortVersions(versions) }
}

export async function loadNodeSources(nodesDir: string): Promise<NodeSource[]> {
  const ids = (await listDirectories(nodesDir)).sort()
  return Promise.all(ids.map((id) => loadNodeSource(nodesDir, id)))
}

export async function loadTemplate(
  versionDir: string,
  provider: string,
): Promise<string | undefined> {
  const providerPath = join(versionDir, 'templates', `${provider}.ts`)
  if (await fileExists(providerPath)) return readFile(providerPath, 'utf-8')
  const defaultPath = join(versionDir, 'template.ts')
  if (await fileExists(defaultPath)) return readFile(defaultPath, 'utf-8')
  return undefined
}

export async function loadTemplates(
  versionDir: string,
  providers: string[],
): Promise<Partial<Record<string, string>>> {
  const templates: Partial<Record<string, string>> = {}
  for (const provider of providers) {
    const template = await loadTemplate(versionDir, provider)
    if (template !== undefined) templates[provider] = template
  }
  return templates
}
