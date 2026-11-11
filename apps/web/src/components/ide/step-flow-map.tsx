import { useMemo, type ReactNode } from 'react'
import { Plus, Zap } from 'lucide-react'
import type { StepPlacement } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { getNodeVisuals } from '../../lib/node-icon-map'
import type { PlacementChoice } from '../../lib/ide/step-placements'
import { choiceKey, placementKey } from '../../lib/ide/step-flow-choices'
import type { StepRow } from '../../lib/ide/step-order'
import { nodeMeta, stepMeta } from '../../lib/ide/step-summary'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import type { StepSyncEdge } from './step-sync-context'

interface StepFlowMapProps {
  rows: readonly StepRow[]
  nodes: ReadonlyMap<string, WorkflowNode>
  edges: readonly StepSyncEdge[]
  entryNodeId: string | null
  reachable: ReadonlySet<string>
  kind: 'workflow' | 'script'
  name: string
  choices: readonly PlacementChoice[]
  /** The trigger card above the first step, e.g. "POST /orders". */
  triggerLabel: string
  placement: StepPlacement | null
  onSelect: (placement: StepPlacement) => void
}

interface MapNode {
  row: StepRow
  children: MapNode[]
}

function edgeIdOf(choice: PlacementChoice): string | undefined {
  return 'first' in choice.placement ? undefined : choice.placement.edgeId
}

function buildTree(rows: readonly StepRow[]): MapNode[] {
  const byId = new Map<string, MapNode>()
  const roots: MapNode[] = []
  for (const row of rows) {
    const node: MapNode = { row, children: [] }
    byId.set(row.nodeId, node)
    const parent = row.parentId === null ? undefined : byId.get(row.parentId)
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function armTone(arm: string): string {
  switch (arm) {
    case 'try':
      return 'border-node-flow/40 bg-node-flow/10 text-node-flow'
    case 'catch':
      return 'border-destructive/40 bg-destructive/10 text-destructive'
    case 'finally':
      return 'border-border bg-muted/60 text-muted-foreground'
    default:
      return 'border-border bg-muted/40 text-muted-foreground'
  }
}

/**
 * The map's body: the flow as a vertical sequence of cards, with a + on every
 * connection. A container is a bordered box holding its arm rows and their
 * own +. The selected placement is drawn as a dashed ghost card on its spot.
 */
export function StepFlowMap({
  rows,
  nodes,
  edges,
  entryNodeId,
  reachable,
  kind,
  name,
  choices,
  triggerLabel,
  placement,
  onSelect,
}: StepFlowMapProps) {
  const { registry } = useNodeRegistry()
  const roots = useMemo(() => buildTree(rows), [rows])
  const containerIds = useMemo(
    () => new Set(rows.map((row) => row.parentId).filter((id): id is string => id !== null)),
    [rows],
  )
  const edgeById = useMemo(() => new Map(edges.map((edge) => [edge.id, edge])), [edges])
  const armsByNode = useMemo(() => {
    const counts = new Map<string, number>()
    for (const edge of edges) {
      if (edge.label === 'then') continue
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    }
    return counts
  }, [edges])
  const activeKey = placement === null ? null : placementKey(placement)
  const afterByNode = new Map<string, PlacementChoice>()
  const edgePoints = new Map<string, PlacementChoice[]>()
  for (const choice of choices) {
    if ('first' in choice.placement) continue
    if (choice.placement.edgeId === undefined) {
      afterByNode.set(choice.placement.after, choice)
      continue
    }
    const edgeId = edgeIdOf(choice)
    if (edgeId === undefined) continue
    const edge = edgeById.get(edgeId)
    if (!edge) continue
    const points = edgePoints.get(edge.target)
    if (points) points.push(choice)
    else edgePoints.set(edge.target, [choice])
  }
  const firstChoice = choices.find((choice) => 'first' in choice.placement)

  function isActive(choice: PlacementChoice | undefined): boolean {
    return choice !== undefined && activeKey !== null && choiceKey(choice) === activeKey
  }

  function ghostArm(choice: PlacementChoice): string | null {
    const edgeId = edgeIdOf(choice)
    if (edgeId === undefined) return null
    return edgeById.get(edgeId)?.label ?? null
  }

  function ghost(key: string, choice: PlacementChoice) {
    const arm = ghostArm(choice)
    return (
      <div
        key={key}
        className="my-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/70 bg-primary/10 px-3 py-2"
      >
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"
          aria-hidden
        >
          {getNodeVisuals('step', registry.get('step')?.icon).icon}
        </span>
        {arm && (
          <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-3xs uppercase tracking-wider text-primary">
            {arm}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
          {name.trim() || 'new_step'}
        </span>
        <span className="rounded bg-primary/15 px-1 py-px text-3xs uppercase tracking-wider text-primary">
          New
        </span>
        <span className="shrink-0 text-2xs text-primary">lands here</span>
      </div>
    )
  }

  function gate(key: string, choice: PlacementChoice | undefined): ReactNode {
    if (choice === undefined) return null
    if (isActive(choice)) return ghost(key, choice)
    return (
      <div key={key} className="flex flex-col items-center">
        <span className="h-2 w-px bg-border" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onSelect(choice.placement)}
          aria-label={choice.label}
          title={choice.label}
          className="h-6 w-6 rounded-full bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
        >
          <Plus className="h-3 w-3" />
        </Button>
        <span className="h-2 w-px bg-border" />
      </div>
    )
  }

  function inlineGate(key: string, choice: PlacementChoice | undefined): ReactNode {
    if (choice === undefined) return null
    if (isActive(choice)) return null
    return (
      <Button
        key={key}
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onSelect(choice.placement)}
        aria-label={choice.label}
        title={choice.label}
        className="h-6 w-6 shrink-0 rounded-full bg-card text-muted-foreground hover:border-primary/60 hover:text-primary"
      >
        <Plus className="h-3 w-3" />
      </Button>
    )
  }

  function card(row: StepRow): ReactNode {
    const node = nodes.get(row.nodeId)
    if (!node) return null
    const meta =
      node.type === 'step'
        ? stepMeta(node, { kind })
        : nodeMeta(node, {
            kind,
            arms: armsByNode.get(row.nodeId) ?? 0,
          })
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted/40 text-muted-foreground"
          aria-hidden
        >
          {getNodeVisuals(node.type, registry.get(node.type)?.icon).icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{node.name}</span>
        {entryNodeId !== null && !reachable.has(row.nodeId) && (
          <span className="shrink-0 rounded bg-muted px-1 py-px text-3xs uppercase tracking-wider text-muted-foreground">
            Not connected
          </span>
        )}
        {meta && <span className="shrink-0 text-2xs text-muted-foreground">{meta}</span>}
      </div>
    )
  }

  function containerHeader(row: StepRow): ReactNode {
    const node = nodes.get(row.nodeId)
    if (!node) return null
    const arms = armsByNode.get(row.nodeId) ?? 0
    return (
      <div className="flex items-center gap-2 px-1 pb-1">
        <span
          className="flex h-5 w-5 items-center justify-center rounded border border-node-error-handling/30 bg-node-error-handling/10 text-node-error-handling"
          aria-hidden
        >
          {getNodeVisuals(node.type, registry.get(node.type)?.icon).icon}
        </span>
        {row.arm && row.armStart && (
          <span
            className={cn(
              'rounded border px-1 py-px text-3xs uppercase tracking-wider',
              armTone(row.arm),
            )}
          >
            {row.arm}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">{node.name}</span>
        <span className="shrink-0 rounded border border-node-error-handling/30 bg-node-error-handling/10 px-1 py-px text-3xs uppercase tracking-wider text-node-error-handling">
          {nodeMeta(node, { kind, arms }) ?? node.type}
        </span>
      </div>
    )
  }

  function nodeView(node: MapNode, at: number): ReactNode {
    if (node.children.length > 0) {
      return (
        <div key={`${node.row.nodeId}-${at}`} className="w-full">
          <div
            className={cn(
              'w-full rounded-xl border bg-muted/10 p-2',
              nodes.get(node.row.nodeId)?.type === 'try_catch'
                ? 'border-node-error-handling/40'
                : 'border-border',
            )}
          >
            {containerHeader(node.row)}
            <div className="flex flex-col gap-1.5">
              {node.children.map((child) => armRow(child))}
            </div>
          </div>
        </div>
      )
    }
    return (
      <div key={`${node.row.nodeId}-${at}`} className="w-full">
        {card(node.row)}
      </div>
    )
  }

  function armRow(node: MapNode): ReactNode {
    const intoArm = node.row.armStart
      ? edgePoints.get(node.row.nodeId)?.find((choice) => {
          const edgeId = edgeIdOf(choice)
          if (edgeId === undefined) return false
          const edge = edgeById.get(edgeId)
          return edge !== undefined && (edge.label ?? null) === (node.row.arm ?? null)
        })
      : undefined
    const after = afterByNode.get(node.row.nodeId)
    // A container's arm edge can target a chain row inside an arm; the row's
    // previous sibling is the container itself, so its after gate does not
    // cover it. Show that edge's own + above the target.
    const beforeChoice = node.row.armStart
      ? undefined
      : edgePoints.get(node.row.nodeId)?.find((choice) => {
          const edgeId = edgeIdOf(choice)
          if (edgeId === undefined) return false
          const edge = edgeById.get(edgeId)
          return edge !== undefined && containerIds.has(edge.source)
        })
    const gates = (
      <div className="flex shrink-0 flex-col gap-1">
        {intoArm && inlineGate(`into-${node.row.nodeId}`, intoArm)}
        {after && after !== intoArm && inlineGate(`after-${node.row.nodeId}`, after)}
      </div>
    )
    return (
      <div key={node.row.nodeId} className="flex flex-col gap-1">
        {beforeChoice && gate(`before-${node.row.nodeId}`, beforeChoice)}
        {intoArm && isActive(intoArm) && ghost(`into-ghost-${node.row.nodeId}`, intoArm)}
        {node.children.length > 0 ? (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{nodeView(node, 0)}</div>
            {gates}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {node.row.arm && node.row.armStart && (
              <span
                className={cn(
                  'shrink-0 rounded border px-1 py-px text-3xs uppercase tracking-wider',
                  armTone(node.row.arm),
                )}
              >
                {node.row.arm}
              </span>
            )}
            {card(node.row)}
            {gates}
          </div>
        )}
        {after && isActive(after) && ghost(`after-ghost-${node.row.nodeId}`, after)}
      </div>
    )
  }

  function transitionChoice(from: MapNode, next: MapNode): PlacementChoice | undefined {
    const after = afterByNode.get(from.row.nodeId)
    if (after) return after
    return edgePoints.get(next.row.nodeId)?.find((choice) => {
      if ('first' in choice.placement) return false
      return choice.placement.after === from.row.nodeId
    })
  }

  const body: ReactNode[] = []
  body.push(
    <div
      key="trigger"
      className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded border border-node-flow/30 bg-node-flow/10 text-node-flow"
        aria-hidden
      >
        <Zap className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-foreground">{triggerLabel}</span>
      <span className="text-3xs uppercase tracking-wider text-muted-foreground">trigger</span>
    </div>,
  )
  body.push(gate('first-gate', firstChoice))
  roots.forEach((root, at) => {
    body.push(nodeView(root, at))
    const next = roots[at + 1]
    if (next) {
      body.push(gate(`between-${root.row.nodeId}`, transitionChoice(root, next)))
    } else {
      const after = afterByNode.get(root.row.nodeId)
      if (after) body.push(gate(`after-last-${root.row.nodeId}`, after))
    }
  })

  return <div className="mx-auto flex w-full max-w-[360px] flex-col gap-2 items-center">{body}</div>
}
