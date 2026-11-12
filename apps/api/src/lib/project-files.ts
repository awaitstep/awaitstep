import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import { PACKAGE_MANIFEST_PATH, PROJECT_HANDLERS_PATH, projectFileBytes } from '@awaitstep/ir'
import type { ProjectFile } from '@awaitstep/ir'
import type { UpsertWorkflowFileData, Workflow } from '@awaitstep/db'

/**
 * The legacy workflow setting a project file stands in for.
 *
 * Removing such a file must retire its setting: the workspace seeds the
 * "deleted" file again from the setting, and a deploy would still use it.
 * So a delete clears the column — and anything that *models* a delete has
 * to model that too, or it judges the edit against a state no real delete
 * leaves behind.
 */
const LEGACY_SETTING_BY_PATH: Readonly<
  Record<string, { triggerCode?: null; dependencies?: null }>
> = {
  [PROJECT_HANDLERS_PATH]: { triggerCode: null },
  [PACKAGE_MANIFEST_PATH]: { dependencies: null },
}

/** The workflow columns to clear when this path is deleted, if any. */
export function retiredByDelete(
  path: string,
): { triggerCode?: null; dependencies?: null } | undefined {
  return LEGACY_SETTING_BY_PATH[path]
}

/**
 * The workflow as it would be once these paths are deleted — the state a
 * check has to judge a candidate deletion against, since `DELETE /files`
 * retires the settings those files stand in for.
 */
export function workflowAfterDeletes(workflow: Workflow, deleted: Iterable<string>): Workflow {
  let next = workflow
  for (const path of deleted) {
    const retired = retiredByDelete(path)
    if (retired) next = { ...next, ...retired }
  }
  return next
}

/** Table rows for a set of project files: fresh ids, content hashes, byte sizes. */
export function toWorkflowFileRows(
  workflowId: string,
  files: readonly ProjectFile[],
): UpsertWorkflowFileData[] {
  return files.map((file) => ({
    id: nanoid(),
    workflowId,
    path: file.path,
    source: file.source,
    hash: contentHash(file.source),
    size: projectFileBytes(file.source),
  }))
}

function isProjectFile(value: unknown): value is ProjectFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProjectFile).path === 'string' &&
    typeof (value as ProjectFile).source === 'string'
  )
}

/** `runtime.files` of a stored IR document; empty for rows that predate the field. */
export function snapshotFilesOf(irJson: string): ProjectFile[] {
  try {
    const parsed = JSON.parse(irJson) as { runtime?: { files?: unknown } }
    const files = parsed.runtime?.files
    return Array.isArray(files) ? files.filter(isProjectFile) : []
  } catch {
    return []
  }
}

/** A content hash as an ETag header value. */
export function etag(hash: string): string {
  return `"${hash}"`
}

/**
 * `If-Match` as a hash: quotes and the weak marker are stripped, `*` means
 * "any existing version". Null when the header is absent.
 */
export function requestedHash(header: string | undefined): string | null {
  if (header === undefined) return null
  const trimmed = header.trim().replace(/^W\//, '')
  if (trimmed === '*') return '*'
  return trimmed.replace(/^"|"$/g, '')
}
