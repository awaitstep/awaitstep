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

/** Compare dotted numeric versions with semver prerelease precedence. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
    if (!match) return null
    return {
      parts: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4] ? match[4].split('.') : [],
    }
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return a.localeCompare(b)

  for (let index = 0; index < 3; index += 1) {
    const difference = left.parts[index]! - right.parts[index]!
    if (difference !== 0) return difference
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0
  if (left.prerelease.length === 0) return 1
  if (right.prerelease.length === 0) return -1

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftPart) - Number(rightPart)
      if (difference !== 0) return difference
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1
    } else {
      const difference = leftPart.localeCompare(rightPart)
      if (difference !== 0) return difference
    }
  }
  return 0
}

export function sortVersions<T extends { version: string }>(versions: T[]): T[] {
  return [...versions].sort((left, right) => compareVersions(left.version, right.version))
}

export function latestVersion(versions: { version: string }[]): string | undefined {
  return sortVersions(versions).at(-1)?.version
}

export function semverProblem(version: string): string | undefined {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
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
