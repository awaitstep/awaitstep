import { useEffect, useMemo, useRef, useState } from 'react'
import { computeVarNames, sanitizeIdentifier } from '@awaitstep/codegen'
import type { StepPlacement } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import type { CreateStepOutcome } from '../../lib/ide/step-create'
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
import { useWorkflowStore } from '../../stores/workflow-store'
import { Dialog, DialogContent } from '../ui/dialog'
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
  onCreate: (placement: StepPlacement, name: string, nodeId: string) => Promise<CreateStepOutcome>
  onClose: () => void
}

type Mode = 'fast' | 'map'

/**
 * Add a step: the fast path places it after/before one step; the map is for
 * branches, where a + on the flow picks the spot. The name, header, footer,
 * fast form and map each live in their own file.
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
  const [name, setName] = useState('')
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
    setName('')
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
  const canInsert = !busy && name.trim() !== '' && activePlacement !== null && previewName !== null

  function handleNameChange(next: string) {
    setName(next)
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
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        '[role="tree"][aria-label="Steps"] [tabindex="0"]',
      )
      const add = document.querySelector<HTMLElement>('[aria-label="New step"]')
      ;(row ?? add)?.focus()
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Enter a step name.')
      return
    }
    if (activePlacement === null) {
      setError('Choose where the step goes.')
      return
    }
    const run = generation.current
    setBusy(true)
    setError(null)
    const outcome = await onCreate(activePlacement, trimmed, fileStem)
    if (generation.current !== run) return
    if (outcome.status === 'created' || outcome.status === 'graph-conflict') {
      if (outcome.status === 'created' && outcome.opened) restoreFocus.current = false
      closeDialog()
      return
    }
    setBusy(false)
    setError(outcome.reason)
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('input[aria-label="Step name"]')?.focus(),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
      <DialogContent
        className="top-[10%] flex max-h-[85vh] w-[460px] max-w-[calc(100vw-2rem)] -translate-y-0 flex-col overflow-hidden p-0"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <StepFlowHeader
            mode={mode}
            busy={busy}
            fileStem={fileStem}
            name={name}
            onNameChange={handleNameChange}
            onClose={requestClose}
            onBack={openFast}
          />
          {mode === 'fast' ? (
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
            />
          ) : (
            <>
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
                  onSelect={(next) => {
                    setMapPlacement(next)
                    setError(null)
                  }}
                />
              </div>
              {error !== null && (
                <p role="alert" className="px-4 pb-2 text-2xs text-destructive">
                  {error}
                </p>
              )}
            </>
          )}

          <StepFlowFooter
            mode={mode}
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
