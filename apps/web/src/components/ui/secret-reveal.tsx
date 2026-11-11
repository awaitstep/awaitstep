import { useId, type FocusEvent, type ReactNode } from 'react'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { hasContent } from './has-content'
import { useCopyStatus } from './use-copy-status'

const COPY_FAILED = 'Couldn’t copy. Select the key and copy it yourself.'

interface SecretRevealProps {
  /** "Your API key". */
  label: string
  value: string
  /** Why to copy it now, e.g. "This is the only time AwaitStep shows the full key." */
  warning: ReactNode
  /**
   * Fires with the value once it is copied, so the dialog's footer can say
   * it's safe to close. Compare it with the value now shown: a regenerated
   * value hasn't been copied yet.
   */
  onCopied?: (value: string) => void
  /** Under the warning, e.g. the "Can: …" permission chips. */
  children?: ReactNode
}

function selectAll(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select()
}

/** A value shown once, such as a new API key, with Copy and a warning to store it. */
export function SecretReveal({ label, value, warning, onCopied, children }: SecretRevealProps) {
  const inputId = useId()
  const { status, copy } = useCopyStatus(value)
  const copied = status === 'copied'
  const failed = status === 'failed'

  async function handleCopy() {
    if (await copy()) onCopied?.(value)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-xs font-medium text-foreground/80">
          {label}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            readOnly
            value={value}
            onFocus={selectAll}
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            variant={copied ? 'outline' : 'default'}
            onClick={handleCopy}
            className={cn('h-11', copied && 'border-primary/40 text-primary')}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p role="status" className={failed ? 'text-2xs text-status-error' : 'sr-only'}>
          {failed && COPY_FAILED}
          {copied && 'Copied'}
        </p>
      </div>
      <div className="flex gap-2.5 rounded-xl bg-tone-warn px-3.5 py-3 text-sm leading-relaxed text-foreground/90">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
        <span>{warning}</span>
      </div>
      {hasContent(children) && children}
    </div>
  )
}
