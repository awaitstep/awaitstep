import { nanoid } from 'nanoid'
import { contentHash } from '@awaitstep/codegen'
import { projectFileBytes } from '@awaitstep/ir'
import type { ProjectFile } from '@awaitstep/ir'
import type { UpsertWorkflowFileData } from '@awaitstep/db'

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
