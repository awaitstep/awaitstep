import { useRef } from 'react'
import { nextTabIndex } from '../../lib/ide/tabs'
import { cn } from '../../lib/utils'
import type { DockTab } from '../../stores/ide-layout-store'

export const DOCK_TAB_DEFS: { id: DockTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'session', label: 'Test session' },
  { id: 'quickTest', label: 'Quick test' },
]

export const dockTabId = (tab: DockTab) => `dock-tab-${tab}`
export const dockPanelId = (tab: DockTab) => `dock-panel-${tab}`

interface DockTabsProps {
  active: DockTab
  problemCount: number
  sessionRunning: boolean
  onSelect: (tab: DockTab) => void
  /** The tabs to show, in order; the workflow IDE's three by default. */
  tabs?: readonly { id: DockTab; label: string }[]
}

/** The dock's tab strip; ←/→ (and Home/End) move between tabs, the active one is the tab stop. */
export function DockTabs({
  active,
  problemCount,
  sessionRunning,
  onSelect,
  tabs = DOCK_TAB_DEFS,
}: DockTabsProps) {
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(event: React.KeyboardEvent) {
    const next = nextTabIndex(
      event.key,
      tabs.findIndex((tab) => tab.id === active),
      tabs.length,
    )
    if (next === null) return
    event.preventDefault()
    onSelect(tabs[next]!.id)
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Panel"
      onKeyDown={handleKeyDown}
      className="flex items-center gap-1"
    >
      {tabs.map((tab) => (
        <DockTabButton
          key={tab.id}
          tab={tab.id}
          label={tab.label}
          active={active === tab.id}
          badge={tab.id === 'problems' ? problemCount : 0}
          live={tab.id === 'session' && sessionRunning}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function DockTabButton({
  tab,
  label,
  active,
  badge,
  live,
  onSelect,
}: {
  tab: DockTab
  label: string
  active: boolean
  badge: number
  /** A session is running behind this tab, whether or not it is open. */
  live: boolean
  onSelect: (tab: DockTab) => void
}) {
  function handleClick() {
    onSelect(tab)
  }

  return (
    <button
      type="button"
      role="tab"
      id={dockTabId(tab)}
      aria-selected={active}
      aria-controls={dockPanelId(tab)}
      tabIndex={active ? 0 : -1}
      onClick={handleClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-2xs font-medium uppercase tracking-wider transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {live && (
        <span
          role="img"
          aria-label="Test session running"
          className="h-1.5 w-1.5 rounded-full bg-status-success"
        />
      )}
      {badge > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-2xs tabular-nums tracking-normal',
            active ? 'bg-muted/80 text-foreground' : 'bg-muted/50 text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
