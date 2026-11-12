import { basename } from '../../lib/ide/file-tree'
import type { ApiLibraryTreeItem, LibraryPlace } from '../../lib/library-api'
import { itemRoot } from '../../lib/library/ide-index'
import type { LibraryWorkspace } from '../../hooks/use-library-workspace'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DeleteLibraryItemDialog } from '../library/dialogs/delete-library-item-dialog'
import { DuplicateLibraryItemDialog } from '../library/dialogs/duplicate-library-item-dialog'
import { RenameLibraryItemDialog } from '../library/dialogs/rename-library-item-dialog'
import { VersionHistoryDialog } from '../library/version-history-dialog'
import type { HistoryPublish } from '../library/history/version-history-empty'
import { RestoreConfirmDialog } from './restore-confirm-dialog'

/** The one dialog the Library IDE has open. */
export type LibraryIdeDialog =
  | { kind: 'rename' | 'duplicate' | 'delete' | 'history'; item: ApiLibraryTreeItem }
  | { kind: 'restore'; item: ApiLibraryTreeItem; version: string }
  | { kind: 'delete-file'; path: string }

interface LibraryIdeDialogsProps {
  ws: LibraryWorkspace
  place: LibraryPlace
  dialog: LibraryIdeDialog
  onClose: () => void
  /** A new, duplicated or restored item: select it and open a file of it. */
  onItemReady: (itemId: string) => void
  /** A restore landed: the item's replaced edits are dropped before it reopens. */
  onRestored: (itemId: string) => void
  onOpenVersion: (item: ApiLibraryTreeItem, version: string) => void
  placeName: string
  /** Publish for the active item, offered by a never-published item's history (28j). */
  publish: (HistoryPublish & { itemId: string }) | null
}

export function LibraryIdeDialogs({
  ws,
  place,
  dialog,
  onClose,
  onItemReady,
  onRestored,
  onOpenVersion,
  placeName,
  publish,
}: LibraryIdeDialogsProps) {
  const { actions } = ws

  function handleCreated(item: { id: string }) {
    onItemReady(item.id)
  }

  switch (dialog.kind) {
    case 'rename': {
      const before = itemRoot(dialog.item)
      return (
        <RenameLibraryItemDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          onRenamed={(renamed) => ws.moveItem(before, itemRoot(renamed))}
        />
      )
    }
    case 'duplicate':
      return (
        <DuplicateLibraryItemDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          onDuplicated={handleCreated}
        />
      )
    case 'delete': {
      const root = itemRoot(dialog.item)
      return (
        <DeleteLibraryItemDialog
          place={place}
          item={dialog.item}
          onClose={onClose}
          onDeleted={() => ws.forgetItem(root)}
        />
      )
    }
    case 'history': {
      const item = dialog.item
      return (
        <VersionHistoryDialog
          place={place}
          item={item}
          onClose={onClose}
          canEdit={ws.canEdit}
          {...(item.kind === 'node' && {
            onOpenReadOnly: (version: string) => onOpenVersion(item, version),
          })}
          onRestored={() => onRestored(item.id)}
          savedAt={item.savedAt}
          placeName={placeName}
          publish={publish?.itemId === item.id ? publish : undefined}
        />
      )
    }
    case 'restore':
      return (
        <RestoreConfirmDialog
          place={place}
          item={dialog.item}
          version={dialog.version}
          onClose={onClose}
          onRestored={onRestored}
        />
      )
    case 'delete-file':
      return (
        <ConfirmDialog
          open
          onOpenChange={onClose}
          title={`Delete ${basename(dialog.path)}?`}
          description="It goes from the working copy. Published versions keep their copy."
          confirmLabel="Delete"
          variant="destructive"
          loading={actions.busy}
          onConfirm={() => void actions.deleteFile(dialog.path).then(onClose)}
        />
      )
  }
}
