import { UNIVERSAL_ENV_PATH, type StepManifest } from '@awaitstep/codegen'
import { isStepSourcePath } from '@awaitstep/ir'
import type { SourceFile } from '../api-client'

/** A bundle generated in the browser: its files and the step manifest that maps nodes to them. */
export interface BrowserBundle {
  files: readonly { path: string; source: string }[]
  manifest: StepManifest | null
}

/** What pending graph edits change in the generated code. */
export interface PendingGenerated {
  /** New text per generated path (a new path too). */
  changed: ReadonlyMap<string, string>
  /** Generated paths the edits remove (a removed node's module, its step's bundle copy). */
  removed: ReadonlySet<string>
  /** The edited bundle's manifest: which module each node is in now. */
  manifest: StepManifest | null
}

/**
 * The generated files as the pending graph edits would make them, judged by
 * the saved and the edited document both generated here: only what differs
 * between the two is taken from the browser, so every file the edits leave
 * alone stays exactly as the server generated it (its Library modules, its
 * paths). `awaitstep/env.ts` is always the server's: it lists the env names
 * resolved from the workspace, project and org, which the browser doesn't
 * have — a name a new node reads appears there after Save. Null when
 * nothing differs or either side couldn't be generated.
 */
export function diffGenerated(
  saved: BrowserBundle | null,
  edited: BrowserBundle | null,
): PendingGenerated | null {
  if (saved === null || edited === null || saved === edited) return null
  const before = new Map(saved.files.map((file) => [file.path, file.source]))
  const afterPaths = new Set(edited.files.map((file) => file.path))
  const changed = new Map<string, string>()
  for (const file of edited.files) {
    if (file.path === UNIVERSAL_ENV_PATH) continue
    if (before.get(file.path) !== file.source) changed.set(file.path, file.source)
  }
  const removed = new Set(
    [...before.keys()].filter((path) => path !== UNIVERSAL_ENV_PATH && !afterPaths.has(path)),
  )
  if (changed.size === 0 && removed.size === 0) return null
  return { changed, removed, manifest: edited.manifest }
}

/**
 * The loaded files with the pending generated changes laid over the
 * generated ones. A project file is never touched. A step's own source is
 * never replaced (it is shown from the version), but a removed node's step
 * path goes: the bundle's copy of a step the edits remove is not a file.
 */
export function withPendingGenerated(
  files: ReadonlyMap<string, SourceFile>,
  pending: PendingGenerated | null,
  ownedPaths: ReadonlySet<string>,
): ReadonlyMap<string, SourceFile> {
  if (pending === null) return files
  const next = new Map(files)
  for (const path of pending.removed) if (!ownedPaths.has(path)) next.delete(path)
  for (const [path, source] of pending.changed) {
    if (ownedPaths.has(path) || isStepSourcePath(path)) continue
    next.set(path, { path, source, role: files.get(path)?.role ?? 'module' })
  }
  return next
}
