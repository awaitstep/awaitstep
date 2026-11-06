import type { GeneratedFile } from '@awaitstep/codegen'
import {
  HANDLER_FETCH_PATH,
  HANDLER_QUEUE_DIR,
  HANDLER_SCHEDULED_PATH,
  HANDLER_SHARED_PATH,
  MAX_PROJECT_FILES,
  MAX_PROJECT_TOTAL_BYTES,
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_DIR,
  PROJECT_HANDLERS_PATH,
  PROJECT_IMPORT_PREFIX,
  isProjectCodePath,
  isStepSourcePath,
  projectFileBytes,
  projectHandlerModules,
  findProjectPathCollision,
  handlerEntry,
  handlerWriteError,
  projectFilePathError,
  projectHandlersConflict,
} from '@awaitstep/ir'
import { basename, dirname, normalizeBundlePath } from './file-tree'

export type FileOwner = 'project' | 'generated' | 'step'

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

export interface OwnerSets {
  /** Every path the person edits as the editor sees it: stored files, virtual seeds, unsaved new files, step sources. */
  projectPaths: ReadonlySet<string>
  /** The paths with a row in the project-file table. */
  storedPaths: ReadonlySet<string>
}

/**
 * Who a path belongs to: `step` for a step node's source under `steps/` — a
 * view of the IR, saved through the version, never a file — `project` for
 * what the person owns as files, `generated` for the rest of the bundle. A
 * file stored under `steps/` before the folder was reserved stays a project
 * file; the path of a step whose node has since been deleted stays a step,
 * so its draft is never offered as a file to create.
 */
export function fileOwner(path: string, sets: OwnerSets): FileOwner {
  if (isStepSourcePath(path) && !sets.storedPaths.has(path)) return 'step'
  return sets.projectPaths.has(path) ? 'project' : 'generated'
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

export type ExplorerSection = 'project' | 'generated'

export interface ExplorerSelection {
  path: string
  kind: 'file' | 'dir'
  section: ExplorerSection
}

/**
 * The folder a new file lands in: the selected folder, else the folder of the
 * selected file, else the folder of the active file. Generated files and an
 * empty selection mean the project root.
 */
export function resolveTargetFolder(input: {
  selected: ExplorerSelection | null
  activePath: string | null
  projectPaths: ReadonlySet<string>
}): string {
  const { selected, activePath, projectPaths } = input
  if (selected) {
    if (selected.section === 'generated') return ''
    return selected.kind === 'dir' ? selected.path : dirname(selected.path)
  }
  return activePath && projectPaths.has(activePath) ? dirname(activePath) : ''
}

/**
 * The full path for what was typed in the new-file row. A typed `/` wins over
 * the target folder; with `relative` (the Folder… row) the target always
 * applies, since the typed path is inside the new folder.
 */
export function resolveNewPath(target: string, typed: string, relative = false): string {
  const clean = normalizeBundlePath(typed.trim())
  if (!clean) return ''
  if (!relative && typed.includes('/')) return clean
  return normalizeBundlePath(target ? `${target}/${clean}` : clean)
}

/** The `#app/…` specifier that imports a project file, or null when nothing imports it by hand. */
export function importSpecifier(path: string): string | null {
  if (!isProjectCodePath(path) || path.startsWith(PROJECT_HANDLERS_DIR)) return null
  return `${PROJECT_IMPORT_PREFIX}${path.replace(/\.(ts|js)$/, '')}`
}

export interface ProjectUsage {
  files: number
  bytes: number
}

export type UsageLevel = 'ok' | 'warn' | 'full'

/** What the project holds the way the server counts it: stored files and their UTF-8 bytes. */
export function projectUsage(files: Iterable<{ source: string }>): ProjectUsage {
  let count = 0
  let bytes = 0
  for (const file of files) {
    count += 1
    bytes += projectFileBytes(file.source)
  }
  return { files: count, bytes }
}

/** Decimal units, as the server's limits are written: 412 KB, 1.3 MB, 2 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const kb = Math.round(bytes / 1000)
  if (kb < 1000) return `${kb} KB`
  return `${Number((bytes / 1_000_000).toFixed(1))} MB`
}

export function usageStatus(usage: ProjectUsage) {
  const ratio = Math.max(usage.files / MAX_PROJECT_FILES, usage.bytes / MAX_PROJECT_TOTAL_BYTES)
  const atFileLimit = usage.files >= MAX_PROJECT_FILES
  const level: UsageLevel =
    atFileLimit || usage.bytes >= MAX_PROJECT_TOTAL_BYTES ? 'full' : ratio >= 0.9 ? 'warn' : 'ok'
  return {
    level,
    ratio: Math.min(ratio, 1),
    atFileLimit,
    label: `${usage.files} of ${MAX_PROJECT_FILES} files · ${formatBytes(usage.bytes)} of ${formatBytes(MAX_PROJECT_TOTAL_BYTES)}`,
    limitReason: atFileLimit
      ? `The project has ${MAX_PROJECT_FILES} files, the most allowed. Delete one to add another.`
      : null,
  }
}

export type NewMenuItemId = 'fetch' | 'scheduled' | 'queue' | 'shared' | 'package' | 'tsconfig'

export interface NewMenuItem {
  id: NewMenuItemId
  label: string
  /** Written straight away; absent when the item first asks for a name. */
  path?: string
  /** Pre-filled in the name row when the item asks for one. */
  prompt?: string
  source?: string
  /** Why the item cannot be used right now. */
  disabledReason: string | null
}

const PACKAGE_STARTER = '{\n  "dependencies": {}\n}\n'
const TSCONFIG_STARTER = '{\n  "compilerOptions": {}\n}\n'

/** The Handlers group of the New menu, each entry disabled with its reason when it cannot be added. */
/** `handlers/shared.*` in any extension the server compiles. */
const SHARED_HANDLER_PATTERN = /^handlers\/shared\.[cm]?[jt]s$/

export function handlerMenuItems(existing: Iterable<string>): NewMenuItem[] {
  const paths = [...existing]
  const modules = projectHandlerModules(paths.map((path) => ({ path })))
  const legacy = paths.includes(PROJECT_HANDLERS_PATH) ? `${PROJECT_HANDLERS_PATH} is in use` : null
  const exists = (path: string | undefined) => (path ? `${basename(path)} exists` : null)
  return [
    {
      id: 'fetch',
      label: 'HTTP',
      path: HANDLER_FETCH_PATH,
      disabledReason: exists(modules.fetch) ?? legacy,
    },
    {
      id: 'scheduled',
      label: 'Scheduled',
      path: HANDLER_SCHEDULED_PATH,
      disabledReason: exists(modules.scheduled) ?? legacy,
    },
    {
      id: 'queue',
      label: 'Queue consumer…',
      prompt: HANDLER_QUEUE_DIR,
      disabledReason: legacy,
    },
    {
      id: 'shared',
      label: 'Shared helpers',
      path: HANDLER_SHARED_PATH,
      disabledReason: exists(paths.find((p) => SHARED_HANDLER_PATTERN.test(p))),
    },
  ]
}

/** `package.json` and `tsconfig.json`, which only the project root may hold. */
export function rootConfigMenuItems(existing: Iterable<string>): NewMenuItem[] {
  const paths = new Set(existing)
  const item = (id: NewMenuItemId, path: string, source: string): NewMenuItem => ({
    id,
    label: path,
    path,
    source,
    disabledReason: paths.has(path) ? `${path} exists` : null,
  })
  return [
    item('package', PACKAGE_MANIFEST_PATH, PACKAGE_STARTER),
    item('tsconfig', 'tsconfig.json', TSCONFIG_STARTER),
  ]
}
