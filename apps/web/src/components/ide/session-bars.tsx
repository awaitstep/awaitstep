import { Button } from '../ui/button'

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

/**
 * A worker can answer with anything. A string is shown as it came — an HTML
 * error page or a stack trace put through JSON.stringify becomes one escaped
 * line, which is exactly when it matters most.
 */
export function formatBody(body: unknown): string {
  if (body === null || body === undefined) return ''
  if (typeof body === 'string') return body
  return JSON.stringify(body, null, 2)
}
