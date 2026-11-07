import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Map as MapIcon, Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { StepPlacement } from '@awaitstep/codegen'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { highlightFor } from '../../lib/ide/step-map'
import { markedFileOf } from '../../lib/ide/tabs'
import { visibleRows } from '../../lib/ide/step-order'
import { railRows } from '../../lib/ide/step-rail-layout'
import { isArmEdge } from '../../lib/ide/step-placements'
import { selectStep } from '../../lib/ide/step-actions'
import { nodeMeta, stepMeta, type SummaryNode } from '../../lib/ide/step-summary'
import { stepsKeyIntent } from '../../lib/ide/steps-keys'
import { escapeCss } from '../../lib/ide/css-escape'
import type { CreateStepOutcome } from '../../lib/ide/step-create'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useIdeStepsStore } from '../../stores/ide-steps-store'
import { SaveVersionFirst } from './save-version-first'
import { StepFlowDialog } from './step-flow-dialog'
import { StepRowItem } from './step-row'
import type { StepOutgoingEdge } from './step-row-menu'
import { useStepSync } from './step-sync-context'

interface StepsViewProps {
  /** The side bar's view switch. */
  tabs: ReactNode
  /** Esc: focus goes back to the editor. */
  onEscape: () => void
  /** The workspace accepts edits; the create controls stay, disabled, otherwise. */
  canEdit: boolean
  /** Why editing is refused right now (a read-only version, a Viewer), or null. */
  readOnlyMessage: string | null
  /** Adds the step and opens its file, or says why it was refused. */
  onCreateStep: (
    placement: StepPlacement,
    name: string,
    nodeId?: string,
  ) => Promise<CreateStepOutcome>
}

/**
 * The side bar's Steps view: the workflow's steps in the order the canvas
 * reads them, containers nested. Picking one opens its file and selects it in
 * the preview; the step whose file is in the editor is marked. A row's menu
 * (or the header's +) opens the add-step dialog.
 */
export function StepsView({
  tabs,
  onEscape,
  canEdit,
  readOnlyMessage,
  onCreateStep,
}: StepsViewProps) {
  const {
    workflowId,
    map,
    rows,
    nodes,
    edges,
    kind,
    workflowFile,
    hasVersion,
    entryNodeId,
    reachable,
    takenStepIds,
  } = useStepSync()
  const { registry } = useNodeRegistry()
  const { activePath, selectedNodeId, focusRequested } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      selectedNodeId: s.selectedNodeId,
      focusRequested: s.stepsFocusRequested,
    })),
  )
  const showing = useIdeLayoutStore((s) => s.sideBarTab === 'steps')
  const previewOpen = useIdeLayoutStore((s) => s.previewOpen)
  const picker = useIdeStepsStore((s) => s.picker)
  const openPicker = useIdeStepsStore((s) => s.openPicker)
  const closePicker = useIdeStepsStore((s) => s.closePicker)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed])
  // The panel stays mounted while the Explorer is open, so the rail is laid
  // out only while it is actually the visible tab.
  const rail = useMemo(() => (showing ? railRows(shown) : []), [showing, shown])
  const activeIds = useMemo(
    () => new Set(highlightFor(map, markedFileOf(activePath)).primary),
    [map, activePath],
  )
  const outgoingByNode = useMemo(() => {
    const idCounts = new Map<string, number>()
    for (const edge of edges) idCounts.set(edge.id, (idCounts.get(edge.id) ?? 0) + 1)
    const byNode = new Map<string, StepOutgoingEdge[]>()
    for (const edge of edges) {
      const node = nodes.get(edge.source)
      if (!node) continue
      const list = byNode.get(edge.source) ?? []
      list.push({
        id: edge.id,
        ...(edge.label !== undefined && { label: edge.label }),
        targetName: nodes.get(edge.target)?.name ?? 'the next step',
        arm: isArmEdge(node, edge),
        uniqueId: idCounts.get(edge.id) === 1,
      })
      byNode.set(edge.source, list)
    }
    return byNode
  }, [edges, nodes])
  // One row stays in the tab order: the one with focus, else the picked step, else the first.
  const shownIds = new Set(shown.map((r) => r.nodeId))
  const tabbableId =
    focusedId && shownIds.has(focusedId)
      ? focusedId
      : selectedNodeId && shownIds.has(selectedNodeId)
        ? selectedNodeId
        : (shown[0]?.nodeId ?? null)

  // Focus is a DOM side effect, so it waits for the list to be on screen.
  // A new step's name row is the one thing that owns the keyboard instead.
  useEffect(() => {
    if (!focusRequested || !showing) return
    document.querySelector<HTMLElement>('[role="tree"][aria-label="Steps"] [tabindex="0"]')?.focus()
    useIdeStore.getState().consumeStepsFocus()
  }, [focusRequested, showing])

  // A version can become read-only under an open dialog (the editor navigates
  // to a historical version). Drop it rather than leave a live-looking create
  // affordance over a workspace that refuses it.
  useEffect(() => {
    if (canEdit) return
    closePicker()
  }, [canEdit, closePicker])

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

  function handleOpenPicker() {
    if (!canEdit) return
    openPicker()
  }

  // A row menu already picked a connection: open the dialog on it.
  function handlePlacement(placement: StepPlacement) {
    if (!canEdit) return
    useIdeLayoutStore.getState().showSideBar('steps')
    openPicker('after' in placement ? placement.after : null, placement)
  }

  function handleToggleMap() {
    useIdeLayoutStore.getState().togglePreview()
  }

  async function handleDialogCreate(
    placement: StepPlacement,
    name: string,
    nodeId: string,
  ): Promise<CreateStepOutcome> {
    const outcome = await onCreateStep(placement, name, nodeId)
    if (outcome.status === 'created' && outcome.opened) {
      useIdeStore.getState().requestEditorFocus()
    }
    return outcome
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        {tabs}
        {hasVersion && (
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleToggleMap}
              aria-label={previewOpen ? 'Hide map' : 'Show map'}
              aria-pressed={previewOpen}
              title={previewOpen ? 'Hide map' : 'Show map'}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <MapIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleOpenPicker()}
              disabled={!canEdit}
              aria-label="New step"
              title={
                canEdit
                  ? 'New step'
                  : (readOnlyMessage ?? 'You can view this workflow but not edit it.')
              }
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      {!map.hasManifest && rows.length > 0 && (
        <p className="border-b border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          No step files for this version, so steps here don’t open code.
        </p>
      )}
      {!hasVersion ? (
        <SaveVersionFirst workflowId={workflowId} reason="Steps come from a saved version." />
      ) : rows.length === 0 ? (
        <p className="px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
          No steps in this version. {canEdit ? 'Add one with + above.' : 'Add them on the canvas.'}
        </p>
      ) : showing ? (
        <div
          role="tree"
          aria-label="Steps"
          onKeyDown={handleKeyDown}
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {shown.map((row, at) => {
            const node = nodes.get(row.nodeId)
            if (!node) return null
            const summary: SummaryNode = node
            const info = map.byNode.get(row.nodeId)
            const outgoing = outgoingByNode.get(row.nodeId) ?? []
            const meta =
              node.type === 'step'
                ? metaLine(
                    stepMeta(summary, { kind }),
                    info?.uses.length ?? 0,
                    info?.filePath ?? null,
                    map.hasManifest,
                    workflowFile,
                  )
                : nodeMeta(summary, {
                    kind,
                    arms: outgoing.filter((edge) => edge.label !== 'then').length,
                  })
            return (
              <StepRowItem
                key={row.nodeId}
                row={row}
                name={node.name}
                icon={getNodeVisuals(node.type, registry.get(node.type)?.icon).icon}
                meta={meta}
                entry={entryNodeId !== null && row.nodeId === entryNodeId}
                unreachable={entryNodeId !== null && !reachable.has(row.nodeId)}
                rail={rail[at]!}
                folded={collapsed.has(row.nodeId)}
                tabbable={row.nodeId === tabbableId}
                active={activeIds.has(row.nodeId)}
                selected={row.nodeId === selectedNodeId}
                outgoing={outgoing}
                canCreate={canEdit}
                readOnlyMessage={readOnlyMessage}
                onPick={handlePick}
                onFold={handleFold}
                onFocusRow={setFocusedId}
                onCreate={handlePlacement}
              />
            )
          })}
        </div>
      ) : null}
      <StepFlowDialog
        open={canEdit && picker !== null}
        preferredNodeId={picker?.preferredNodeId ?? null}
        initialPlacement={picker?.placement ?? null}
        rows={rows}
        nodes={nodes}
        edges={edges}
        entryNodeId={entryNodeId}
        reachable={reachable}
        takenStepIds={takenStepIds}
        kind={kind}
        onCreate={handleDialogCreate}
        onClose={closePicker}
      />
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
