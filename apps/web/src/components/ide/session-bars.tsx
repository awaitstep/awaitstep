import { Button } from '../ui/button'

/** The strip that names each pane of the session panel and holds its controls. One fixed height, so the panes' rules meet in a line. */
export const PANE_HEADER =
  'flex h-9 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border px-3'

/** A warning strip about the session being behind, with the one thing that fixes it. */
export function StalenessLine({
  text,
  action,
  onAction,
}: {
  text: string
  action: string
  onAction: () => void
}) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-md border border-status-warning/30 bg-tone-warn px-2.5 py-1.5 text-xs text-foreground/80"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" />
      <span className="flex-1">{text}</span>
      <Button size="sm" variant="outline" onClick={onAction} className="h-6 px-2 text-xs">
        {action}
      </Button>
    </div>
  )
}
