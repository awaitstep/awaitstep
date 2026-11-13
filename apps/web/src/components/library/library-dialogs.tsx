import type { LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryRow } from '../../lib/library-api'
import type { LibraryRowAction } from './parts/library-row-menu'
import { DeleteLibraryItemDialog } from './dialogs/delete-library-item-dialog'
import { DuplicateLibraryItemDialog } from './dialogs/duplicate-library-item-dialog'
import { MoveLibraryItemDialog } from './dialogs/move-library-item-dialog'
import { RenameLibraryItemDialog } from './dialogs/rename-library-item-dialog'
import { VersionHistoryDialog } from './version-history-dialog'

/** The one dialog the Library page has open. */
export type LibraryDialog = {
  kind: LibraryRowAction
  item: ApiLibraryRow
}

interface LibraryDialogsProps {
  place: LibraryPlaceSlugs
  /** Where the drafts live, for a never-published item's history. */
  placeName: string
  /** Who a copy or move to the project hands it to. */
  projectName: string
  dialog: LibraryDialog
  /** The viewer may change the place's items: history offers Restore. */
  canEdit: boolean
  onClose: () => void
}

/** Renders the page's open dialog; each closes itself through `onClose`. */
export function LibraryDialogs({
  place,
  placeName,
  projectName,
  dialog,
  canEdit,
  onClose,
}: LibraryDialogsProps) {
  switch (dialog.kind) {
    case 'history':
      return (
        <VersionHistoryDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          canEdit={canEdit}
          savedAt={dialog.item.updatedAt}
          placeName={placeName}
        />
      )
    case 'rename':
      return <RenameLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
    case 'duplicate':
      return <DuplicateLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
    case 'copy-to-project':
      return (
        <DuplicateLibraryItemDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          toProject={projectName}
        />
      )
    case 'move-to-project':
      return (
        <MoveLibraryItemDialog
          place={place}
          item={dialog.item}
          projectName={projectName}
          onClose={onClose}
        />
      )
    case 'delete':
      return <DeleteLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
  }
}
