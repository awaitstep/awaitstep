import { flushSync } from 'react-dom'
import { useIdeLayoutStore, type SideBarTab } from '../../stores/ide-layout-store'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { cn } from '../../lib/utils'

const TABS: { id: SideBarTab; label: string }[] = [
  { id: 'explorer', label: 'Explorer' },
  { id: 'search', label: 'Search' },
  { id: 'steps', label: 'Steps' },
]

/** Each view draws its own copy of the tabs, so a tab's id says which copy it is. */
export function sideBarTabId(view: SideBarTab, tab: SideBarTab): string {
  return `sidebar-tab-${view}-${tab}`
}

export function sideBarPanelId(tab: SideBarTab): string {
  return `sidebar-panel-${tab}`
}

/**
 * Shows a view and hands the keyboard to it, because the control that was
 * just used sits in the view that is now hidden. Search takes it in its box;
 * the other view takes it on its own tab.
 */
function showView(next: SideBarTab, focusSearchBox: boolean) {
  flushSync(() => useIdeLayoutStore.getState().setSideBarTab(next))
  if (focusSearchBox && next === 'search') {
    useIdeSearchStore.getState().requestFocus()
    return
  }
  const shown = [...document.querySelectorAll<HTMLElement>(`[data-sidebar-tab="${next}"]`)]
  shown.find((el) => el.closest('[hidden]') === null)?.focus()
}

/**
 * The switch between the side bar's views. Each view draws its own copy in
 * its header, so only the visible one is ever reachable. Arrows move between
 * tabs and the tab keeps the keyboard; clicking or pressing Enter or Space
 * on one moves it into the view that opens.
 */
export function SideBarTabs({ view }: { view: SideBarTab }) {
  const tab = useIdeLayoutStore((s) => s.sideBarTab)

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    // The tabs wrap: right from the last is the first.
    const step = event.key === 'ArrowRight' ? 1 : -1
    const index = TABS.findIndex((t) => t.id === tab)
    showView(TABS[(index + step + TABS.length) % TABS.length]!.id, false)
  }

  return (
    <div role="tablist" aria-label="Side bar" onKeyDown={handleKeyDown} className="flex gap-2.5">
      {TABS.map((t) => (
        <SideBarTabButton
          key={t.id}
          view={view}
          id={t.id}
          label={t.label}
          selected={t.id === tab}
        />
      ))}
    </div>
  )
}

function SideBarTabButton({
  view,
  id,
  label,
  selected,
}: {
  view: SideBarTab
  id: SideBarTab
  label: string
  selected: boolean
}) {
  function handleClick() {
    // Enter and Space arrive as clicks, with no pointer: the keyboard goes along.
    showView(id, true)
  }

  return (
    <button
      type="button"
      role="tab"
      id={sideBarTabId(view, id)}
      aria-selected={selected}
      aria-controls={sideBarPanelId(id)}
      tabIndex={selected ? 0 : -1}
      data-sidebar-tab={id}
      onClick={handleClick}
      className={cn(
        'text-[11px] font-semibold uppercase tracking-wider transition-colors',
        selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}
