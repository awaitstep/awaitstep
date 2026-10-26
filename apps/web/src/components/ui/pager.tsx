import { Button } from './button'

interface PagerProps {
  /** E.g. "Showing 8 of 128 runs in the last 24 hours". */
  summary: string
  hasNewer: boolean
  hasOlder: boolean
  onNewer: () => void
  onOlder: () => void
  /** Names the navigation landmark, e.g. "Runs pages". */
  label?: string
}

/** Newer / Older paging under a table, for cursor-paged lists. */
export function Pager({
  summary,
  hasNewer,
  hasOlder,
  onNewer,
  onOlder,
  label = 'Pages',
}: PagerProps) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center gap-2.5 px-5 py-3 text-2xs text-muted-foreground"
    >
      <span className="flex-1" aria-live="polite">
        {summary}
      </span>
      <Button variant="outline" size="sm" disabled={!hasNewer} onClick={onNewer}>
        Newer
      </Button>
      <Button variant="outline" size="sm" disabled={!hasOlder} onClick={onOlder}>
        Older
      </Button>
    </nav>
  )
}
