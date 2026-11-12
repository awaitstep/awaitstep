import { MoreHorizontal } from 'lucide-react'
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

export type LibraryRowAction = 'history' | 'rename' | 'duplicate' | 'delete'

interface LibraryRowMenuProps {
  row: ApiLibraryRow
  /** The viewer may change the item: Rename, Duplicate and Delete show. */
  canEdit: boolean
  onOpen: (row: ApiLibraryRow) => void
  onAction: (action: LibraryRowAction, row: ApiLibraryRow) => void
}

/** A row's `…` menu (28g): open it, its history, the edits, and its import path. */
export function LibraryRowMenu({ row, canEdit, onOpen, onAction }: LibraryRowMenuProps) {
  const importPath = importPathOf(row)

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

  function handleDelete() {
    onAction('delete', row)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${row.name}`}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={handleOpen}>Open in IDE</DropdownMenuItem>
        <DropdownMenuItem onSelect={handleHistory}>Version history</DropdownMenuItem>
        {canEdit && <DropdownMenuItem onSelect={handleRename}>Rename</DropdownMenuItem>}
        {canEdit && <DropdownMenuItem onSelect={handleDuplicate}>Duplicate</DropdownMenuItem>}
        {importPath && <DropdownMenuItem onSelect={handleCopy}>Copy import path</DropdownMenuItem>}
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleDelete} className="text-status-error">
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
