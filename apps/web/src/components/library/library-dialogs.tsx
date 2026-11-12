import type { LibraryPlaceSlugs } from '../../lib/dashboard-paths'
import type { ApiLibraryRow, LibraryKind } from '../../lib/library-api'
import { DeleteLibraryItemDialog } from './dialogs/delete-library-item-dialog'
import { DuplicateLibraryItemDialog } from './dialogs/duplicate-library-item-dialog'
import { NewLibraryItemDialog } from './dialogs/new-library-item-dialog'
import { RenameLibraryItemDialog } from './dialogs/rename-library-item-dialog'
import { VersionHistoryDialog } from './version-history-dialog'

/** The one dialog the Library page has open. */
export type LibraryDialog =
  | { kind: 'new'; itemKind: LibraryKind }
  | { kind: 'history' | 'rename' | 'duplicate' | 'delete'; item: ApiLibraryRow }

interface LibraryDialogsProps {
  place: LibraryPlaceSlugs
  dialog: LibraryDialog
  /** The viewer may change the place's items: history offers Restore. */
  canEdit: boolean
  onClose: () => void
}

/** Renders the page's open dialog; each closes itself through `onClose`. */
export function LibraryDialogs({ place, dialog, canEdit, onClose }: LibraryDialogsProps) {
  switch (dialog.kind) {
    case 'new':
      return <NewLibraryItemDialog place={place} kind={dialog.itemKind} onClose={onClose} />
    case 'history':
      return (
        <VersionHistoryDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          canEdit={canEdit}
        />
      )
    case 'rename':
      return <RenameLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
    case 'duplicate':
      return <DuplicateLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
    case 'delete':
      return <DeleteLibraryItemDialog place={place} item={dialog.item} onClose={onClose} />
  }
}
