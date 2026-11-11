import { cn } from '../../lib/utils'
import { Button } from './button'
import { useCopyStatus } from './use-copy-status'

const COPY_LABEL = { idle: 'Copy', copied: 'Copied', failed: 'Couldn’t copy' } as const

interface CopyCommandProps {
  /** The command shown, one line, and what Copy puts on the clipboard. */
  command: string
  /** What Copy copies, for a screen reader: "Copy the curl command". */
  label: string
  className?: string
}

/** A shell command in a box, cut to one line, with Copy. */
export function CopyCommand({ command, label, className }: CopyCommandProps) {
  const copy = useCopyStatus(command)

  function handleCopy() {
    void copy.copy()
  }

  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2',
        className,
      )}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
        {command}
      </code>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto shrink-0 p-0 text-xs"
        aria-label={label}
        onClick={handleCopy}
      >
        {COPY_LABEL[copy.status]}
      </Button>
    </span>
  )
}
