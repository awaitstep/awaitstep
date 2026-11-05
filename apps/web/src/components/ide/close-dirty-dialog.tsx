import { useIdeStore } from '../../stores/ide-store'
import { basename, dirname } from '../../lib/ide/file-tree'
import { ConfirmDialog } from '../ui/confirm-dialog'

interface CloseDirtyDialogProps {
  /** A save is in flight; both ways forward wait for it. */
  saving: boolean
  onSave: (dirty: string[], paths: string[]) => void
  onDiscard: (dirty: string[], paths: string[]) => void
}

/** Asks Save / Don't save / Cancel once for a close that includes unsaved tabs. */
export function CloseDirtyDialog({ saving, onSave, onDiscard }: CloseDirtyDialogProps) {
  const request = useIdeStore((s) => s.closeRequest)
  const cancelClose = useIdeStore((s) => s.cancelClose)

  function handleOpenChange(open: boolean) {
    if (!open) cancelClose()
  }

  function handleConfirm() {
    if (request) onSave(request.dirty, request.paths)
  }

  function handleSecondary() {
    if (request) onDiscard(request.dirty, request.paths)
  }

  const dirty = request?.dirty ?? []
  const single = dirty.length === 1
  const title = single
    ? `Save changes to ${basename(dirty[0]!)}?`
    : `Save changes to ${dirty.length} files?`

  return (
    <ConfirmDialog
      open={request !== null}
      onOpenChange={handleOpenChange}
      title={title}
      description={
        <>
          {!single && (
            <ul className="mb-2 space-y-0.5">
              {dirty.map((path) => (
                <li key={path} className="flex items-baseline gap-1.5 text-foreground/80">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" />
                  {basename(path)}
                  {dirname(path) && (
                    <span className="truncate text-xs text-muted-foreground">{dirname(path)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          Your changes will be lost if you don’t save.
        </>
      }
      confirmLabel={single ? 'Save' : 'Save all'}
      secondaryLabel="Don’t save"
      onSecondary={handleSecondary}
      variant="default"
      loading={saving}
      onConfirm={handleConfirm}
    />
  )
}
