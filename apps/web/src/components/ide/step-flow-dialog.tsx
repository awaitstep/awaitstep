import { useEffect, useMemo, useRef, useState } from 'react'
import { computeVarNames, sanitizeIdentifier } from '@awaitstep/codegen'
import type { StepPlacement } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { useAddNodeDraft, type AddKind } from '../../hooks/use-add-node-draft'
import type { CreateStepOutcome, NewTemplateNode } from '../../lib/ide/step-create'
import type { PlacementChoice } from '../../lib/ide/step-placements'
import type { StepRow } from '../../lib/ide/step-order'
import {
  afterChoices,
  beforeChoices,
  choiceKey,
  flowChoices,
  placementKey,
  uniqueStepId,
  type FlowSide,
} from '../../lib/ide/step-flow-choices'
import { escapeCss } from '../../lib/ide/css-escape'
import { useWorkflowStore } from '../../stores/workflow-store'
import { Dialog, DialogContent } from '../ui/dialog'
import { AddNodeFields } from './add-node-fields'
import { AddNodeList } from './add-node-list'
import { StepFlowFast } from './step-flow-fast'
import { StepFlowFooter } from './step-flow-footer'
import { StepFlowHeader } from './step-flow-header'
import { StepFlowMap } from './step-flow-map'
import type { StepSyncEdge } from './step-sync-context'

interface StepFlowDialogProps {
  open: boolean
  preferredNodeId: string | null
  /** A connection chosen from a row menu; opens on it (the map for an arm). */
  initialPlacement: StepPlacement | null
  rows: readonly StepRow[]
  nodes: ReadonlyMap<string, WorkflowNode>
  edges: readonly StepSyncEdge[]
  entryNodeId: string | null
  reachable: ReadonlySet<string>
  takenStepIds: ReadonlySet<string>
  kind: 'workflow' | 'script'
  onCreate: (
    placement: StepPlacement,
    name: string,
    nodeId: string,
    template?: NewTemplateNode,
  ) => Promise<CreateStepOutcome>
  onClose: () => void
}

type Mode = 'fast' | 'map'

/**
 * Add a step or a custom node: the fast path places it after/before one step;
 * the map is for branches, where a + on the flow picks the spot. A custom
 * node is picked from the palette's list first, then named and filled in.
 * The name, header, footer, fast form, node list and map each live in their
 * own file.
 */
export function StepFlowDialog({
  open,
  preferredNodeId,
  initialPlacement,
  rows,
  nodes,
  edges,
  entryNodeId,
  reachable,
  takenStepIds,
  kind,
  onCreate,
  onClose,
}: StepFlowDialogProps) {
  const draft = useAddNodeDraft()
  const { name, picked, picking, reset: resetDraft } = draft
  const [mode, setMode] = useState<Mode>('fast')
  const [side, setSide] = useState<FlowSide>('after')
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [mapPlacement, setMapPlacement] = useState<StepPlacement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wasOpen = useRef(false)
  const generation = useRef(0)
  // A created step's editor focus must not be replaced by the Steps row when
  // the dialog's close auto-focus runs.
  const restoreFocus = useRef(true)
  // A custom node added by this open: the close focuses its Steps row.
  const createdNodeId = useRef<string | null>(null)

  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges])
  const allChoices = useMemo(
    () => flowChoices(open, rows, nodes, edges, entryNodeId),
    [open, rows, nodes, edges, entryNodeId],
  )
  const afters = useMemo(() => afterChoices(allChoices), [allChoices])
  const befores = useMemo(
    () => (open ? beforeChoices(rows, nodes, edges, entryNodeId) : []),
    [open, rows, nodes, edges, entryNodeId],
  )
  const fastChoices = side === 'after' ? afters : befores
  const fastChoice = fastChoices.find((choice) => choice.nodeId === anchorId) ?? fastChoices[0]
  const fastPlacement = fastChoice?.placement ?? null
  const mapChoice =
    mapPlacement === null
      ? undefined
      : allChoices.find((choice) => choiceKey(choice) === placementKey(mapPlacement))
  // A menu can clear the map placement; the first choice is a safe default, so
  // the map always has a ghost and the footer always names a spot.
  const effectiveMapChoice = mapChoice ?? allChoices[0]
  const effectiveMapPlacement = effectiveMapChoice?.placement ?? null
  const activePlacement = mode === 'fast' ? fastPlacement : effectiveMapPlacement

  // Reset once per open: the dialog stays mounted between opens.
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      generation.current += 1
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    generation.current += 1
    restoreFocus.current = true
    createdNodeId.current = null
    resetDraft()
    setError(null)
    setBusy(false)
    setMode('fast')
    setSide('after')
    setAnchorId(afters[0]?.nodeId ?? null)
    setMapPlacement(
      afters[0]?.placement ?? befores[0]?.placement ?? allChoices[0]?.placement ?? null,
    )

    if (rows.length === 0) {
      setMode('map')
      setMapPlacement(allChoices[0]?.placement ?? null)
      return
    }
    if (initialPlacement !== null) {
      setMapPlacement(initialPlacement)
      if ('first' in initialPlacement) {
        setSide('before')
        setAnchorId(entryNodeId)
        setMode('fast')
      } else if (initialPlacement.edgeId === undefined) {
        setSide('after')
        setAnchorId(initialPlacement.after)
        setMode('fast')
      } else {
        setMode('map')
      }
      return
    }
    if (preferredNodeId === null) return
    const after = afters.find((choice) => choice.nodeId === preferredNodeId)
    if (after) {
      setSide('after')
      setAnchorId(after.nodeId)
      setMapPlacement(after.placement)
      return
    }
    const onMap =
      allChoices.find((choice) => {
        if (choice.nodeId !== preferredNodeId) return false
        return 'first' in choice.placement ? false : choice.placement.edgeId !== undefined
      }) ?? allChoices.find((choice) => choice.nodeId === preferredNodeId)
    if (onMap) {
      setMode('map')
      setMapPlacement(onMap.placement)
      return
    }
    const before = befores.find((choice) => choice.nodeId === preferredNodeId)
    if (before) {
      setSide('before')
      setAnchorId(before.nodeId)
      setMapPlacement(before.placement)
    }
  }, [
    open,
    preferredNodeId,
    initialPlacement,
    entryNodeId,
    afters,
    befores,
    allChoices,
    rows.length,
    resetDraft,
  ])

  const previewName = useMemo(() => {
    if (!open) return null
    const trimmed = name.trim()
    if (trimmed === '' || sanitizeIdentifier(trimmed) === '') return null
    let placeholder = '__new_step__'
    while (nodes.has(placeholder)) placeholder += '_'
    return computeVarNames([...nodes.values(), { id: placeholder, name: trimmed }]).get(placeholder)
  }, [open, name, nodes])

  const workflowName = useWorkflowStore((state) => state.metadata.name)
  const triggerLabel = kind === 'script' ? 'HTTP request' : `POST /${workflowName || 'workflow'}`
  const fileStem = uniqueStepId(name, nodes, takenStepIds)
  const mapSummary = effectiveMapChoice?.label ?? 'Choose a place'
  const canInsert =
    !busy && !picking && name.trim() !== '' && activePlacement !== null && previewName !== null
  const noun = draft.kind === 'step' ? 'step' : 'node'

  function handleNameChange(next: string) {
    draft.setName(next)
    setError(null)
  }

  function handleKindChange(next: AddKind) {
    draft.setKind(next)
    setError(null)
  }

  function handleChangeNode() {
    draft.unpick()
    setError(null)
  }

  function handleMapSelect(next: StepPlacement) {
    setMapPlacement(next)
    setError(null)
  }

  function chooseSide(next: FlowSide) {
    setSide(next)
    const list = next === 'after' ? afters : befores
    if (!list.some((choice) => choice.nodeId === anchorId)) {
      setAnchorId(list[0]?.nodeId ?? null)
    }
    setError(null)
  }

  function chooseAnchor(choice: PlacementChoice) {
    setAnchorId(choice.nodeId)
    setError(null)
  }

  function openMap() {
    setMapPlacement(fastPlacement ?? effectiveMapPlacement)
    setMode('map')
    setError(null)
  }

  function openFast() {
    let nextSide: FlowSide = 'after'
    let nextAnchor: string | null = afters[0]?.nodeId ?? null
    if (effectiveMapPlacement !== null) {
      if ('first' in effectiveMapPlacement) {
        nextSide = 'before'
        nextAnchor = entryNodeId
      } else if (effectiveMapPlacement.edgeId === undefined) {
        nextSide = 'after'
        nextAnchor = effectiveMapPlacement.after
      } else {
        nextSide = 'before'
        nextAnchor = edgeById.get(effectiveMapPlacement.edgeId)?.target ?? null
      }
    }
    const list = nextSide === 'after' ? afters : befores
    if (!list.some((choice) => choice.nodeId === nextAnchor)) {
      nextSide = 'after'
      nextAnchor = afters[0]?.nodeId ?? null
    }
    setSide(nextSide)
    setAnchorId(nextAnchor)
    setMode('fast')
    setError(null)
  }

  function closeDialog() {
    generation.current += 1
    onClose()
  }

  function requestClose() {
    // The POST cannot be cancelled; leave the dialog open until it settles.
    if (busy) return
    closeDialog()
  }

  function handleCloseAutoFocus(event: Event) {
    event.preventDefault()
    if (!restoreFocus.current) return
    const created = createdNodeId.current
    requestAnimationFrame(() => {
      const tree = '[role="tree"][aria-label="Steps"]'
      const row =
        (created !== null
          ? document.querySelector<HTMLElement>(`${tree} [data-step-id="${escapeCss(created)}"]`)
          : null) ?? document.querySelector<HTMLElement>(`${tree} [tabindex="0"]`)
      const add = document.querySelector<HTMLElement>('[data-steps-add]')
      ;(row ?? add)?.focus()
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    // React bubbles a submit through portals: one from a dialog opened over
    // this one (the marketplace) must not insert.
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (picking) {
      setError('Choose a node to add.')
      return
    }
    if (trimmed === '') {
      setError(`Enter a ${noun} name.`)
      return
    }
    if (activePlacement === null) {
      setError(`Choose where the ${noun} goes.`)
      return
    }
    const run = generation.current
    setBusy(true)
    setError(null)
    const outcome = await onCreate(activePlacement, trimmed, fileStem, draft.template())
    if (generation.current !== run) return
    if (outcome.status === 'created' || outcome.status === 'graph-conflict') {
      // A new step's file takes focus. A custom node has none: it is selected,
      // so its Steps row is the one the close focuses.
      if (outcome.status === 'created' && outcome.opened) {
        if (outcome.path !== null) restoreFocus.current = false
        else createdNodeId.current = outcome.nodeId
      }
      closeDialog()
      return
    }
    setBusy(false)
    setError(outcome.reason)
    const nameLabel = noun === 'step' ? 'Step name' : 'Node name'
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(`input[aria-label="${nameLabel}"]`)?.focus(),
    )
  }

  // The picked custom node's name, fields and Inline switch; it replaces the
  // step name in the fast form and sits under the map otherwise.
  const nodeForm =
    draft.kind === 'custom' && picked ? (
      <AddNodeFields
        definition={picked}
        name={name}
        data={draft.fields}
        error={error}
        busy={busy}
        onNameChange={handleNameChange}
        onFieldChange={draft.setField}
        onChangeNode={handleChangeNode}
      />
    ) : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
      <DialogContent
        className="top-[10%] flex max-h-[85vh] w-[460px] max-w-[calc(100vw-2rem)] -translate-y-0 flex-col overflow-hidden p-0"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <StepFlowHeader
            mode={picking ? 'fast' : mode}
            kind={draft.kind}
            onKindChange={handleKindChange}
            busy={busy}
            fileStem={fileStem}
            name={name}
            onNameChange={handleNameChange}
            onClose={requestClose}
            onBack={openFast}
          />
          {picking ? (
            <AddNodeList onPick={draft.pick} error={error} />
          ) : mode === 'fast' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <StepFlowFast
                name={name}
                error={error}
                side={side}
                fastChoice={fastChoice}
                fastChoices={fastChoices}
                fileStem={fileStem}
                onNameChange={handleNameChange}
                onSideChange={chooseSide}
                onAnchorChange={chooseAnchor}
                onOpenMap={openMap}
                nodeForm={nodeForm}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="max-h-[52vh] min-h-[240px] overflow-y-auto px-4 py-3">
                <StepFlowMap
                  rows={rows}
                  nodes={nodes}
                  edges={edges}
                  entryNodeId={entryNodeId}
                  reachable={reachable}
                  kind={kind}
                  name={name}
                  choices={allChoices}
                  triggerLabel={triggerLabel}
                  placement={effectiveMapPlacement}
                  onSelect={handleMapSelect}
                />
              </div>
              {nodeForm && <div className="border-t border-border px-4 py-3">{nodeForm}</div>}
              {error !== null && nodeForm === undefined && (
                <p role="alert" className="px-4 pb-2 text-2xs text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <StepFlowFooter
            mode={picking ? 'fast' : mode}
            picking={picking}
            name={name}
            side={side}
            fastChoiceName={fastChoice?.nodeName ?? null}
            mapSummary={mapSummary}
            busy={busy}
            canInsert={canInsert}
            onCancel={requestClose}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
