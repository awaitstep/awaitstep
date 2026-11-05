import type { RunConfirm } from '../../hooks/use-run-action'
import { ConfirmDialog } from '../ui/confirm-dialog'

/** The question Run or Trigger asks before using a session that lacks the open work. */
export function RunConfirmDialog({ confirm }: { confirm: RunConfirm }) {
  return (
    <ConfirmDialog
      open={confirm.open}
      onOpenChange={confirm.onOpenChange}
      title={confirm.title}
      description={confirm.description}
      confirmLabel={confirm.confirmLabel}
      variant="default"
      secondaryLabel={confirm.secondaryLabel}
      onSecondary={confirm.onSecondary}
      onConfirm={confirm.onConfirm}
    />
  )
}
