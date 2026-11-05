import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { cn } from '../../lib/utils'
import { highlightFor } from '../../lib/ide/step-map'
import { markedFileOf } from '../../lib/ide/tabs'
import { visibleRows, type StepRow } from '../../lib/ide/step-order'
import { selectStep } from '../../lib/ide/step-actions'
import { stepMeta, type SummaryNode } from '../../lib/ide/step-summary'
import { stepsKeyIntent } from '../../lib/ide/steps-keys'
import { escapeCss } from '../../lib/ide/css-escape'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useStepSync } from './step-sync-context'

interface StepsViewProps {
  /** The side bar's view switch. */
  tabs: ReactNode
  /** Esc: focus goes back to the editor. */
  onEscape: () => void
}

/**
 * The side bar's Steps view: the workflow's steps in the order the canvas
 * reads them, containers nested. Picking one opens its file and selects it in
 * the preview; the step whose file is in the editor is marked.
 */
export function StepsView({ tabs, onEscape }: StepsViewProps) {
  const { map, rows, nodes, kind, workflowFile } = useStepSync()
  const { registry } = useNodeRegistry()
  const { activePath, selectedNodeId, focusRequested } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      selectedNodeId: s.selectedNodeId,
      focusRequested: s.stepsFocusRequested,
    })),
  )
  const showing = useIdeLayoutStore((s) => s.sideBarTab === 'steps')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed])
  const activeIds = useMemo(
    () => new Set(highlightFor(map, markedFileOf(activePath)).primary),
    [map, activePath],
  )
  // One row stays in the tab order: the one with focus, else the picked step, else the first.
  const shownIds = new Set(shown.map((r) => r.nodeId))
  const tabbableId =
    focusedId && shownIds.has(focusedId)
      ? focusedId
      : selectedNodeId && shownIds.has(selectedNodeId)
        ? selectedNodeId
        : (shown[0]?.nodeId ?? null)

  // Focus is a DOM side effect, so it waits for the list to be on screen.
  useEffect(() => {
    if (!focusRequested || !showing) return
    document.querySelector<HTMLElement>('[role="tree"][aria-label="Steps"] [tabindex="0"]')?.focus()
    useIdeStore.getState().consumeStepsFocus()
  }, [focusRequested, showing])

  function focusRow(nodeId: string) {
    setFocusedId(nodeId)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-step-id="${escapeCss(nodeId)}"]`)?.focus()
    })
  }

  function setFolded(nodeId: string, folded: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (folded) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }

  function handlePick(nodeId: string) {
    selectStep(map, nodeId, 'stay')
  }

  function handleFold(nodeId: string) {
    setFolded(nodeId, !collapsed.has(nodeId))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const nodeId = (event.target as HTMLElement).dataset.stepId
    if (!nodeId || event.altKey || event.ctrlKey || event.metaKey) return
    const intent = stepsKeyIntent(shown, collapsed, nodeId, event.key)
    if (!intent) return
    event.preventDefault()
    switch (intent.type) {
      case 'focus':
        return focusRow(intent.nodeId)
      case 'expand':
        return setFolded(intent.nodeId, false)
      case 'collapse':
        return setFolded(intent.nodeId, true)
      case 'select':
        return handlePick(intent.nodeId)
      case 'escape':
        return onEscape()
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">{tabs}</div>
      {!map.hasManifest && rows.length > 0 && (
        <p className="border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {kind === 'script'
            ? 'A function has no step files, so steps here don’t open code.'
            : 'No step files for this version, so steps here don’t open code.'}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
          No steps in this version. Add them on the canvas.
        </p>
      ) : (
        <div
          role="tree"
          aria-label="Steps"
          onKeyDown={handleKeyDown}
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {shown.map((row) => {
            const node = nodes.get(row.nodeId)
            if (!node) return null
            const summary: SummaryNode = node
            const info = map.byNode.get(row.nodeId)
            return (
              <StepItem
                key={row.nodeId}
                row={row}
                name={node.name}
                icon={getNodeVisuals(node.type, registry.get(node.type)?.icon).icon}
                meta={metaLine(
                  stepMeta(summary),
                  info?.uses.length ?? 0,
                  info?.filePath ?? null,
                  map.hasManifest,
                  workflowFile,
                )}
                folded={collapsed.has(row.nodeId)}
                tabbable={row.nodeId === tabbableId}
                active={activeIds.has(row.nodeId)}
                selected={row.nodeId === selectedNodeId}
                onPick={handlePick}
                onFold={handleFold}
                onFocusRow={setFocusedId}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function metaLine(
  settings: string | null,
  uses: number,
  filePath: string | null,
  hasManifest: boolean,
  workflowFile: string | null,
): string | null {
  const parts: string[] = []
  if (hasManifest && filePath === null)
    parts.push(workflowFile ? `In ${workflowFile.split('/').pop()}` : 'No file')
  if (settings) parts.push(settings)
  if (uses > 0) parts.push(uses === 1 ? 'uses 1 file' : `uses ${uses} files`)
  return parts.length > 0 ? parts.join(' · ') : null
}

interface StepItemProps {
  row: StepRow
  name: string
  icon: ReactNode
  meta: string | null
  folded: boolean
  tabbable: boolean
  active: boolean
  selected: boolean
  onPick: (nodeId: string) => void
  onFold: (nodeId: string) => void
  onFocusRow: (nodeId: string) => void
}

function StepItem({
  row,
  name,
  icon,
  meta,
  folded,
  tabbable,
  active,
  selected,
  onPick,
  onFold,
  onFocusRow,
}: StepItemProps) {
  const Chevron = folded ? ChevronRight : ChevronDown

  function handleClick() {
    onPick(row.nodeId)
  }

  function handleFocus(event: React.FocusEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onFocusRow(row.nodeId)
  }

  function handleChevronClick(event: React.MouseEvent) {
    event.stopPropagation()
    onFold(row.nodeId)
  }

  return (
    <div
      role="treeitem"
      tabIndex={tabbable ? 0 : -1}
      data-step-id={row.nodeId}
      aria-level={row.depth + 1}
      aria-expanded={row.container ? !folded : undefined}
      aria-selected={selected}
      aria-current={active ? 'true' : undefined}
      onClick={handleClick}
      onFocus={handleFocus}
      className={cn(
        'flex min-h-8 w-full cursor-pointer items-center gap-1.5 pr-2 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary',
        selected
          ? 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]'
          : active
            ? 'bg-muted/70 text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
      )}
      style={{ paddingLeft: `${8 + row.depth * 14}px` }}
    >
      {row.container ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={folded ? `Expand ${name}` : `Collapse ${name}`}
          onClick={handleChevronClick}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
        >
          <Chevron className="h-3 w-3" />
        </button>
      ) : (
        <span className="w-4 shrink-0" aria-hidden />
      )}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 py-1">
        <span className="block truncate text-xs">
          {row.arm && (
            <span className="mr-1.5 text-[10px] uppercase tracking-wider">{row.arm}</span>
          )}
          {name}
        </span>
        {meta && <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>}
      </span>
    </div>
  )
}
