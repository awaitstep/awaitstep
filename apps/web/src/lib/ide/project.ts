import type { GeneratedFile } from '@awaitstep/codegen'
import {
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_PATH,
  findProjectPathCollision,
  handlerEntry,
  handlerWriteError,
  projectFilePathError,
  projectHandlersConflict,
} from '@awaitstep/ir'
import { normalizeBundlePath } from './file-tree'

export type FileOwner = 'project' | 'generated'

export interface WorkspaceFiles {
  project: GeneratedFile[]
  generated: GeneratedFile[]
}

/** Partitions the loaded bundle into what the project owns and what the canvas generated. */
export function splitWorkspaceFiles(
  files: Iterable<GeneratedFile>,
  projectPaths: ReadonlySet<string>,
): WorkspaceFiles {
  const split: WorkspaceFiles = { project: [], generated: [] }
  for (const file of files) {
    split[projectPaths.has(file.path) ? 'project' : 'generated'].push(file)
  }
  return split
}

export function fileOwner(path: string, projectPaths: ReadonlySet<string>): FileOwner {
  return projectPaths.has(path) ? 'project' : 'generated'
}

interface LegacySettings {
  triggerCode?: string | null
  dependencies?: string | null
}

/**
 * Legacy workflow settings surfaced as files the user can adopt: trigger
 * code appears as `handlers.ts` and the dependencies setting as
 * `package.json`, each only while no real project file of that name exists.
 * Saving one creates the real file, which the server then prefers.
 */
export function virtualSeedFiles(
  settings: LegacySettings,
  projectPaths: ReadonlySet<string>,
): GeneratedFile[] {
  const seeds: GeneratedFile[] = []
  const handlers = settings.triggerCode?.trim()
  // A project on handler modules has left the annotation model; the legacy
  // setting is not offered back to it.
  const usesModules = [...projectPaths].some((p) => handlerEntry(p))
  if (handlers && !usesModules && !projectPaths.has(PROJECT_HANDLERS_PATH)) {
    seeds.push({ path: PROJECT_HANDLERS_PATH, source: settings.triggerCode!, role: 'handlers' })
  }
  const dependencies = parseDependencySetting(settings.dependencies)
  if (dependencies && !projectPaths.has(PACKAGE_MANIFEST_PATH)) {
    seeds.push({
      path: PACKAGE_MANIFEST_PATH,
      source: `${JSON.stringify({ dependencies }, null, 2)}\n`,
      role: 'meta',
    })
  }
  return seeds
}

function parseDependencySetting(raw: string | null | undefined): Record<string, string> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return Object.keys(parsed).length > 0 ? (parsed as Record<string, string>) : null
  } catch {
    return null
  }
}

/** The path a user typed, cleaned the way the server will see it. */
export function normalizeNewPath(raw: string): string {
  return normalizeBundlePath(raw.trim())
}

/**
 * Why `raw` cannot become a new project file among `existing` paths, or
 * null when it can — the same rules the server applies, so the dialog can
 * refuse before a round trip.
 */
export function newFileError(raw: string, existing: Iterable<string>): string | null {
  const path = normalizeNewPath(raw)
  if (!path) return 'Enter a file path, e.g. config/env.ts'
  const pathError = projectFilePathError(path)
  if (pathError) return `${path} ${pathError}`
  const paths = [...existing]
  if (paths.includes(path)) return `${path} already exists`
  const collision = findProjectPathCollision(path, paths)
  if (collision) return `${path} would overwrite ${collision} after compile`
  const handlerError = handlerWriteError(path, paths)
  if (handlerError) return `${path} ${handlerError}`
  return projectHandlersConflict(path, paths)
}
