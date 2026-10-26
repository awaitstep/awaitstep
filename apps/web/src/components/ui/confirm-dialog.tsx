import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Input } from './input'
import { overlayBackdropVariants, OverlayFooter } from './overlay-parts'

type ConfirmVariant = 'destructive' | 'warning' | 'default'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  variant?: ConfirmVariant
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
  /** Toned tile above the title; switches to the dashboard's sectioned layout. */
  icon?: LucideIcon
  /**
   * Text the user must type before Confirm enables, e.g. the project's name.
   * Matched exactly after trimming. Switches to the sectioned layout.
   */
  confirmText?: string
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const sectioned = props.icon !== undefined || props.confirmText !== undefined
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        {sectioned ? <SectionedContent {...props} /> : <ClassicContent {...props} />}
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

interface ConfirmActionsProps extends ConfirmDialogProps {
  disabled?: boolean
  size?: 'sm' | 'default'
  cancelVariant?: 'ghost' | 'outline'
}

function ConfirmActions({
  confirmLabel = 'Confirm',
  variant = 'destructive',
  onConfirm,
  secondaryLabel,
  onSecondary,
  loading,
  disabled,
  size = 'sm',
  cancelVariant = 'ghost',
}: ConfirmActionsProps) {
  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    onConfirm()
  }

  function handleSecondary() {
    onSecondary?.()
  }

  return (
    <>
      <AlertDialog.Cancel asChild>
        <Button variant={cancelVariant} size={size}>
          Cancel
        </Button>
      </AlertDialog.Cancel>
      {secondaryLabel && onSecondary && (
        <Button variant="outline" size={size} disabled={loading} onClick={handleSecondary}>
          {secondaryLabel}
        </Button>
      )}
      <AlertDialog.Action asChild>
        <Button
          size={size}
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          className={
            variant === 'warning' ? 'bg-status-warning hover:bg-status-warning/80 text-white' : ''
          }
          disabled={loading || disabled}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
      </AlertDialog.Action>
    </>
  )
}

function ClassicContent(props: ConfirmDialogProps) {
  return (
    <>
      <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
        <AlertDialog.Title className="text-base font-semibold text-foreground">
          {props.title}
        </AlertDialog.Title>
        <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {props.description}
        </AlertDialog.Description>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ConfirmActions {...props} />
        </div>
      </AlertDialog.Content>
    </>
  )
}

const ICON_TONE: Record<ConfirmVariant, string> = {
  destructive: 'bg-tone-fail text-status-error',
  warning: 'bg-tone-warn text-status-warning',
  default: 'bg-tone-info text-status-info',
}

// Rendered only while open, so the typed text starts empty every time.
function SectionedContent(props: ConfirmDialogProps) {
  const { title, description, icon: Icon, confirmText, variant = 'destructive', loading } = props
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const matches = confirmText === undefined || typed.trim() === confirmText

  function handleOpenAutoFocus(event: Event) {
    if (!inputRef.current) return
    event.preventDefault()
    inputRef.current.focus()
  }

  function handleTypedChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTyped(event.target.value)
  }

  function handleTypedKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (matches && !loading) props.onConfirm()
  }

  return (
    <>
      <AlertDialog.Overlay className={overlayBackdropVariants({ layout: 'sectioned' })} />
      <AlertDialog.Content
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex w-[480px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-lg',
          variant === 'destructive' ? 'border-destructive/40' : 'border-border',
        )}
      >
        <div className="flex flex-col gap-3.5 p-6">
          {Icon && (
            <span
              className={cn(
                'flex size-11 items-center justify-center rounded-xl',
                ICON_TONE[variant],
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
          )}
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </AlertDialog.Description>
          {confirmText !== undefined && (
            <div className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-xs text-foreground/80">
                Type <b className="font-semibold text-foreground">{confirmText}</b> to confirm
              </label>
              <Input
                ref={inputRef}
                id={inputId}
                value={typed}
                onChange={handleTypedChange}
                onKeyDown={handleTypedKeyDown}
                placeholder={confirmText}
                autoComplete="off"
                spellCheck={false}
                className="border-destructive/40"
              />
            </div>
          )}
        </div>
        <OverlayFooter>
          <ConfirmActions {...props} disabled={!matches} size="default" cancelVariant="outline" />
        </OverlayFooter>
      </AlertDialog.Content>
    </>
  )
}
