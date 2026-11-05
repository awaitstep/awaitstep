import { FileCode2, Workflow } from 'lucide-react'
import { cn } from '../../lib/utils'

export type EditorView = 'canvas' | 'code'

interface ViewSwitchProps {
  /** The view on screen; its segment is the pressed one. */
  current: EditorView
  onSelect: (view: EditorView) => void
}

const SEGMENTS: { view: EditorView; label: string; hint: string; Icon: typeof Workflow }[] = [
  { view: 'canvas', label: 'Canvas', hint: 'Edit the graph', Icon: Workflow },
  { view: 'code', label: 'Code', hint: 'Edit the code', Icon: FileCode2 },
]

/**
 * Canvas | Code, the same control on both sides so you always see which one
 * you are on. Picking the current segment does nothing; picking the other one
 * goes through the usual unsaved-changes check.
 */
export function ViewSwitch({ current, onSelect }: ViewSwitchProps) {
  return (
    <div
      role="group"
      aria-label="View"
      className="flex shrink-0 items-center rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {SEGMENTS.map(({ view, label, hint, Icon }) => {
        const active = view === current
        function handleClick() {
          if (!active) onSelect(view)
        }
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            title={active ? `${label} (you are here)` : hint}
            onClick={handleClick}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors md:px-2.5',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
