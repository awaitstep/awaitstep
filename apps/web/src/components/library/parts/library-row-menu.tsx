import { MoreHorizontal } from 'lucide-react'
import { usedByLabel } from '../library-format'
import { copyToClipboard } from '../../../lib/utils'
import { actionToast } from '../../../lib/action-toast'
import type { ApiLibraryRow } from '../../../lib/library-api'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { importPathOf } from '../library-format'

export type LibraryRowAction =
  'history' | 'rename' | 'duplicate' | 'copy-to-project' | 'move-to-project' | 'delete'

interface LibraryRowMenuProps {
  row: ApiLibraryRow
  /** The viewer may change the item: Rename, Duplicate and Delete show. */
  canEdit: boolean
  /** The viewer may also add to the project's library: Copy and Move to project show. */
  canToProject?: boolean
  onOpen: (row: ApiLibraryRow) => void
  onAction: (action: LibraryRowAction, row: ApiLibraryRow) => void
}

/** A row's `…` menu (28g): open it, its history, the edits, and its import path. */
export function LibraryRowMenu({
  row,
  canEdit,
  canToProject = false,
  onOpen,
  onAction,
}: LibraryRowMenuProps) {
  const importPath = importPathOf(row)
  const toProject = canEdit && canToProject && row.owner.kind === 'workspace'

  function handleCopy() {
    if (!importPath) return
    copyToClipboard(importPath).then(
      () => actionToast.success(`Copied ${importPath}`),
      () => actionToast.error('Couldn’t copy the import path'),
    )
  }

  function handleOpen() {
    onOpen(row)
  }

  function handleHistory() {
    onAction('history', row)
  }

  function handleRename() {
    onAction('rename', row)
  }

  function handleDuplicate() {
    onAction('duplicate', row)
  }

  function handleCopyToProject() {
    onAction('copy-to-project', row)
  }

  function handleMoveToProject() {
    onAction('move-to-project', row)
  }

  function handleDelete() {
    onAction('delete', row)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-[30px] rounded-lg"
          aria-label={`Actions for ${row.name}`}
        >
          <MoreHorizontal className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={handleOpen}>Open in IDE</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleHistory}>Version history</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onSelect={handleRename}>Rename</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onSelect={handleDuplicate}>Duplicate</DropdownMenuItem>}
        {toProject && (
          <>
            <DropdownMenuItem onSelect={handleCopyToProject}>Copy to project</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleMoveToProject}>Move to project</DropdownMenuItem>
          </>
        )}
        {importPath && <DropdownMenuItem onSelect={handleCopy}>Copy import path</DropdownMenuItem>}
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleDelete} className="text-status-error">
              Delete
            </DropdownMenuItem>
          </>
        )}
        {canEdit && row.usedBy > 0 && (
          <p className="px-3 pt-1.5 pb-2 text-2xs leading-snug text-muted-foreground">
            Used by {usedByLabel(row.usedBy)}, so Delete is refused.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
