import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  variant?: 'destructive' | 'warning' | 'default'
  onConfirm: () => void
  /**
   * A second way forward that is not the recommended one — "switch without
   * saving" next to "save and switch". Neither this nor Confirm closes the
   * dialog on its own: the caller decides, because an action that fails
   * (a save that does not validate) must leave the dialog standing.
   */
  secondaryLabel?: string
  onSecondary?: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'destructive',
  onConfirm,
  secondaryLabel,
  onSecondary,
  loading,
}: ConfirmDialogProps) {
  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    onConfirm()
  }

  function handleSecondary() {
    onSecondary?.()
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </AlertDialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            {secondaryLabel && onSecondary && (
              <Button variant="outline" size="sm" disabled={loading} onClick={handleSecondary}>
                {secondaryLabel}
              </Button>
            )}
            <AlertDialog.Action asChild>
              <Button
                size="sm"
                variant={variant === 'destructive' ? 'destructive' : 'default'}
                className={
                  variant === 'warning'
                    ? 'bg-status-warning hover:bg-status-warning/80 text-white'
                    : ''
                }
                disabled={loading}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
