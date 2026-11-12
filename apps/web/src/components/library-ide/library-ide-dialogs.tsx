import { basename, dirname } from '../../lib/ide/file-tree'
import type { ApiLibraryTreeItem, LibraryKind, LibraryPlace } from '../../lib/library-api'
import { newFileError } from '../../lib/library/explorer-tree'
import { itemRoot } from '../../lib/library/ide-index'
import type { LibraryWorkspace } from '../../hooks/use-library-workspace'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DeleteLibraryItemDialog } from '../library/dialogs/delete-library-item-dialog'
import { DuplicateLibraryItemDialog } from '../library/dialogs/duplicate-library-item-dialog'
import { NewLibraryItemDialog } from '../library/dialogs/new-library-item-dialog'
import { RenameLibraryItemDialog } from '../library/dialogs/rename-library-item-dialog'
import { VersionHistoryDialog } from '../library/version-history-dialog'
import { FileNameDialog } from './file-name-dialog'
import { RestoreConfirmDialog } from './restore-confirm-dialog'

/** The one dialog the Library IDE has open. */
export type LibraryIdeDialog =
  | { kind: 'new-item'; itemKind: LibraryKind }
  | { kind: 'rename' | 'duplicate' | 'delete' | 'history'; item: ApiLibraryTreeItem }
  | { kind: 'restore'; item: ApiLibraryTreeItem; version: string }
  | { kind: 'new-file'; folder: string }
  | { kind: 'rename-file' | 'delete-file'; path: string }

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
}

export function LibraryIdeDialogs({
  ws,
  place,
  dialog,
  onClose,
  onItemReady,
  onRestored,
  onOpenVersion,
}: LibraryIdeDialogsProps) {
  const { actions, index } = ws

  function handleCreated(item: { id: string }) {
    onItemReady(item.id)
  }

  switch (dialog.kind) {
    case 'new-item':
      return (
        <NewLibraryItemDialog
          place={place}
          kind={dialog.itemKind}
          onClose={onClose}
          onCreated={handleCreated}
        />
      )
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
    case 'new-file':
      return (
        <FileNameDialog
          title="New file"
          folder={dialog.folder}
          submitLabel="Create"
          validate={(name) => newFileError(index, dialog.folder, name)}
          onSubmit={(name) => actions.createFile(`${dialog.folder}/${name}`)}
          onClose={onClose}
        />
      )
    case 'rename-file': {
      const folder = dirname(dialog.path)
      return (
        <FileNameDialog
          title={`Rename ${basename(dialog.path)}`}
          folder={folder}
          initial={basename(dialog.path)}
          submitLabel="Rename"
          validate={(name) => newFileError(index, folder, name)}
          onSubmit={(name) => actions.renameFile(dialog.path, `${folder}/${name}`)}
          onClose={onClose}
        />
      )
    }
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
