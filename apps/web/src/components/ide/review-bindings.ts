import type { GeneratedFile } from '@awaitstep/codegen'
import type { Editability } from '../../lib/ide/editability'
import type { FileOwner } from '../../lib/ide/project'
import type { SourceFile } from '../../lib/api-client'

/**
 * What the editor group needs from the workspace to show saved-vs-unsaved
 * diffs, outside-change banners and Compare. The workspace owns saving,
 * undo and refetching; the views only call these.
 */
export interface ReviewBindings {
  workflowId: string
  /** Baseline with drafts laid over it — what the editor shows. */
  files: ReadonlyMap<string, GeneratedFile>
  /** The files as last loaded from the server, drafts not applied. */
  baseline: ReadonlyMap<string, SourceFile>
  canEdit: boolean
  /** A write is in flight. */
  busy: boolean
  editabilityOf: (path: string) => Editability
  /** Who a path belongs to: a step's source is a canvas node's code, not a stored file. */
  ownerOf: (path: string) => FileOwner
  /** Typing in a diff's right side. */
  onChange: (path: string, source: string) => void
  /** Drops one file's unsaved edits, with an Undo toast. */
  onRevert: (path: string) => void
  /** Resolves to whether the file was saved. */
  onSave: (path: string) => Promise<boolean>
  onSaveAll: () => void
  /** Opens Compare for a file. */
  onCompare: (path: string) => void
  /** Keep mine and overwrite: resolves to whether it was written. */
  onOverwrite: (path: string, serverHash: string | null) => Promise<boolean>
  /** Replaces the unsaved copy with the server's; `loadedHash` is the copy that was on screen. */
  onUseServerVersion: (path: string, loadedHash: string | null) => void
  /** Creates a file that was deleted on the server, from the unsaved copy; resolves to whether it was written. */
  onRecreate: (path: string) => Promise<boolean>
  /** Lets go of an unsaved copy whose file was deleted on the server. */
  onDiscardDeleted: (path: string) => void
}
