import { cn } from '../../lib/utils'
import { CopyIconButton } from './copy-icon-button'

interface CopyCommandProps {
  /** The command shown, one line, and what the copy icon puts on the clipboard. */
  command: string
  /** What is copied, for the copy icon's accessible name: "curl command" reads "Copy the curl command". */
  label: string
  /**
   * Show all of it on one line, the box as wide as the text, scrolling
   * sideways where there is less room, rather than cut with an ellipsis (a URL).
   */
  full?: boolean
  className?: string
}

/** A shell command in a box, on one line, with a copy icon. */
export function CopyCommand({ command, label, full, className }: CopyCommandProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2',
        // As wide as the text, up to the space there is.
        full && 'w-fit max-w-full self-start',
        className,
      )}
    >
      <code
        className={cn(
          'min-w-0 flex-1 font-mono text-sm text-muted-foreground',
          full ? 'overflow-x-auto whitespace-nowrap' : 'truncate',
        )}
      >
        {command}
      </code>
      <CopyIconButton value={command} label={label} />
    </span>
  )
}
