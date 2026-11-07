import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { StepPlacement } from '@awaitstep/codegen'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { highlightFor } from '../../lib/ide/step-map'
import { markedFileOf } from '../../lib/ide/tabs'
import { visibleRows } from '../../lib/ide/step-order'
import { selectStep } from '../../lib/ide/step-actions'
import { stepMeta, type SummaryNode } from '../../lib/ide/step-summary'
import { stepsKeyIntent } from '../../lib/ide/steps-keys'
import { escapeCss } from '../../lib/ide/css-escape'
import type { CreateStepOutcome } from '../../lib/ide/step-create'
import { useIdeLayoutStore } from '../../stores/ide-layout-store'
import { useIdeStore } from '../../stores/ide-store'
import { useIdeStepsStore } from '../../stores/ide-steps-store'
import { SaveVersionFirst } from './save-version-first'
import { StepCreateRow } from './step-create-row'
import { StepRowItem } from './step-row'
import type { StepOutgoingEdge } from './step-row-menu'
import { useStepSync, type StepSyncValue } from './step-sync-context'

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
  onCreateStep: (placement: StepPlacement, name: string) => Promise<CreateStepOutcome>
}

/**
 * The side bar's Steps view: the workflow's steps in the order the canvas
 * reads them, containers nested. Picking one opens its file and selects it in
 * the preview; the step whose file is in the editor is marked. A row's menu
 * (or the header's +) places a new step and opens its name row.
 */
export function StepsView({
  tabs,
  onEscape,
  canEdit,
  readOnlyMessage,
  onCreateStep,
}: StepsViewProps) {
  const { workflowId, map, rows, nodes, edges, kind, workflowFile, hasVersion } = useStepSync()
  const { registry } = useNodeRegistry()
  const { activePath, selectedNodeId, focusRequested } = useIdeStore(
    useShallow((s) => ({
      activePath: s.activePath,
      selectedNodeId: s.selectedNodeId,
      focusRequested: s.stepsFocusRequested,
    })),
  )
  const showing = useIdeLayoutStore((s) => s.sideBarTab === 'steps')
  const create = useIdeStepsStore((s) => s.create)
  const beginCreate = useIdeStepsStore((s) => s.beginCreate)
  const endCreate = useIdeStepsStore((s) => s.endCreate)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed])
  const activeIds = useMemo(
    () => new Set(highlightFor(map, markedFileOf(activePath)).primary),
    [map, activePath],
  )
  const outgoingByNode = useMemo(() => {
    const byNode = new Map<string, StepOutgoingEdge[]>()
    for (const edge of edges) {
      const list = byNode.get(edge.source) ?? []
      list.push({
        id: edge.id,
        ...(edge.label !== undefined && { label: edge.label }),
        targetName: nodes.get(edge.target)?.name ?? 'the next step',
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
    if (!create) {
      document
        .querySelector<HTMLElement>('[role="tree"][aria-label="Steps"] [tabindex="0"]')
        ?.focus()
    }
    useIdeStore.getState().consumeStepsFocus()
  }, [focusRequested, showing, create])

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

  // The header's + appends after the last step of the main chain. A row with
  // several outgoing connections (a branch, a fan-out, a container's arms)
  // has no single "after" to append to, so the last plain row with at most
  // one connection is the anchor — the person picks an arm from that row's
  // own menu instead.
  function handleHeaderCreate() {
    const anchor = [...rows]
      .reverse()
      .find((row) => !row.container && (outgoingByNode.get(row.nodeId)?.length ?? 0) <= 1)
    if (!anchor) {
      beginCreate({ first: true })
      return
    }
    beginCreate({ after: anchor.nodeId })
  }

  async function handleCreate(name: string): Promise<string | null> {
    const placement = create
    if (!placement) return 'No place to put the step.'
    const outcome = await onCreateStep(placement, name)
    if (outcome.status === 'created' || outcome.status === 'graph-conflict') {
      // A conflict keeps nothing to retry here: the workspace notice explains.
      endCreate()
      // The new file is open (the create opened it); put the keyboard in it.
      if (outcome.status === 'created' && outcome.opened) {
        useIdeStore.getState().requestEditorFocus()
      }
      return null
    }
    return outcome.reason
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        {tabs}
        {hasVersion && (
          <button
            type="button"
            onClick={handleHeaderCreate}
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
        )}
      </div>
      {create && (
        <StepCreateRow
          key={placementKey(create)}
          hint={placementHint(create, nodes, edges)}
          onSubmit={handleCreate}
          onCancel={endCreate}
        />
      )}
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
              <StepRowItem
                key={row.nodeId}
                row={row}
                name={node.name}
                icon={getNodeVisuals(node.type, registry.get(node.type)?.icon).icon}
                meta={metaLine(
                  stepMeta(summary, { kind }),
                  info?.uses.length ?? 0,
                  info?.filePath ?? null,
                  map.hasManifest,
                  workflowFile,
                )}
                folded={collapsed.has(row.nodeId)}
                tabbable={row.nodeId === tabbableId}
                active={activeIds.has(row.nodeId)}
                selected={row.nodeId === selectedNodeId}
                outgoing={outgoingByNode.get(row.nodeId) ?? []}
                canCreate={canEdit}
                readOnlyMessage={readOnlyMessage}
                onPick={handlePick}
                onFold={handleFold}
                onFocusRow={setFocusedId}
                onCreate={beginCreate}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A stable identity for the open name row: a different placement starts a fresh one. */
function placementKey(placement: StepPlacement): string {
  return 'first' in placement ? 'first' : `${placement.after}:${placement.edgeId ?? ''}`
}

/** What the name row says about where the step goes. */
function placementHint(
  placement: StepPlacement,
  nodes: StepSyncValue['nodes'],
  edges: StepSyncValue['edges'],
): string {
  if ('first' in placement) return 'First step'
  const source = nodes.get(placement.after)
  if (placement.edgeId !== undefined) {
    const edge = edges.find((e) => e.id === placement.edgeId)
    if (edge?.label) return `Into ${edge.label}`
    const target = edge ? nodes.get(edge.target) : undefined
    if (target) return `Before ${target.name}`
  }
  return source ? `After ${source.name}` : 'After this step'
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
