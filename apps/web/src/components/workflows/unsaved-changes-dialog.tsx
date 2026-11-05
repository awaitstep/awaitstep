import { useRef } from 'react'
import { focusEditorSoon } from '../../lib/ide/editor-focus'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { unsavedDialogCopy, type WorkspaceSurface } from '../../lib/workflows/surfaces'

interface UnsavedChangesDialogProps {
  open: boolean
  /** What is unsaved, as a sentence — each surface says it in its own terms. */
  unsaved: string
  /** The surface being switched to, or null when leaving the workspace. */
  switchTarget: WorkspaceSurface | null
  /** This version accepts a save (an older version does not). */
  canSave: boolean
  /** A save is in flight; both ways forward wait for it. */
  saving: boolean
  onCancel: () => void
  /** Save, then go — only if the save actually succeeds. */
  onSaveAndGo: () => void
  /** Go without saving, which discards the unsaved work. */
  onDiscardAndGo: () => void
  /**
   * Look at the unsaved changes first. Offered only where there is a place to
   * look; it is expected to cancel the navigation and open the review.
   */
  onReview?: () => void
}

/**
 * The one dialog standing between unsaved work and navigation, for both
 * editing surfaces.
 *
 * Shared because the two surfaces were drifting: they had separately worded
 * copies of the same prompt, and only one of them said how much was
 * unsaved. What differs between them is the sentence naming what is dirty
 * and what saving means — everything else is the same decision.
 */
export function UnsavedChangesDialog({
  open,
  unsaved,
  switchTarget,
  canSave,
  saving,
  onCancel,
  onSaveAndGo,
  onDiscardAndGo,
  onReview,
}: UnsavedChangesDialogProps) {
  const reviewing = useRef(false)
  const copy = unsavedDialogCopy({ to: switchTarget, unsaved, canSave })
  // Saving is the primary action wherever it is on offer, so Confirm means
  // "save and go" there and "go anyway" everywhere else.
  const offersSave = copy.secondaryLabel !== undefined
  const handleConfirm = offersSave ? onSaveAndGo : onDiscardAndGo

  function handleOpenChange(next: boolean) {
    if (!next) onCancel()
  }

  function handleReview() {
    reviewing.current = true
    onReview?.()
  }

  // Radix would return focus to whatever opened the dialog; the person asked
  // to look at the changes, so the keyboard goes to the review instead.
  function handleCloseAutoFocus(event: Event) {
    if (!reviewing.current) return
    reviewing.current = false
    event.preventDefault()
    focusEditorSoon()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      variant={copy.variant}
      loading={saving}
      onConfirm={handleConfirm}
      {...(offersSave && {
        secondaryLabel: copy.secondaryLabel,
        onSecondary: onDiscardAndGo,
      })}
      {...(onReview && {
        leadingLabel: 'Review…',
        onLeading: handleReview,
        onCloseAutoFocus: handleCloseAutoFocus,
      })}
    />
  )
}
