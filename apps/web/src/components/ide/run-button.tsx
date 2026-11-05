import { Loader2, Play } from 'lucide-react'
import { IDE_SHORTCUTS, formatShortcut } from '../../lib/ide/shortcuts'
import { isMacPlatform } from '../../lib/platform'
import { Button } from '../ui/button'

export interface RunButtonProps {
  /** What pressing it will do: "Quick test step", "Start and trigger", … */
  label: string
  /** A session is starting or stopping, so there is nothing to run yet. */
  busy: boolean
  onRun: () => void
}

/** The one Run, in the editor's toolbar. Its label names the action; the shortcut is on it. */
export function RunButton({ label, busy, onRun }: RunButtonProps) {
  const hint = formatShortcut(IDE_SHORTCUTS.run, isMacPlatform())
  return (
    <div className="flex shrink-0 items-center border-l border-border px-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={onRun}
        title={`${label} (${hint})`}
        className="h-6 gap-1.5 px-2 text-xs"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        {label}
        <kbd className="font-sans text-[10px]">{hint}</kbd>
      </Button>
    </div>
  )
}
