import { useCallback, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { SimulationPath } from '../../lib/simulate-workflow'
import { cn } from '../../lib/utils'

const NODE_TYPE_LABELS: Record<string, string> = {
  step: 'Step',
  sleep: 'Sleep',
  sleep_until: 'Sleep Until',
  branch: 'Branch',
  parallel: 'Parallel',
  race: 'Race',
  loop: 'Loop',
  try_catch: 'Try/Catch',
  break: 'Exit',
  sub_workflow: 'Sub-Workflow',
  sub_script: 'Call Script',
  http_request: 'HTTP',
  wait_for_event: 'Event',
}

/**
 * Highlights a single node on the canvas without opening the config panel.
 * Only touches the previously-selected and newly-selected nodes (O(1) mutations
 * instead of O(n) map) by tracking the last-highlighted ID.
 */
function useHighlightNode() {
  const { fitView } = useReactFlow()

  return useCallback(
    (nodeId: string) => {
      // Update node selection directly in the store without triggering isDirty.
      // We bypass React Flow's setNodes to avoid 'replace' change events.
      const store = useWorkflowStore.getState()
      const updated = store.nodes.map((n) => {
        const shouldSelect = n.id === nodeId
        return n.selected === shouldSelect ? n : { ...n, selected: shouldSelect }
      })
      useWorkflowStore.setState({ nodes: updated })

      fitView({ nodes: [{ id: nodeId }], duration: 0, padding: 0.5 })
    },
    [fitView],
  )
}

const STATUS_COLORS: Record<string, string> = {
  executed: 'text-status-success',
  'skipped-instant': 'text-status-warning',
  'event-received': 'text-status-info',
}

function PathSection({
  path,
  onHighlight,
}: {
  path: SimulationPath
  onHighlight: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground/70">{path.label}</span>
        {path.completed ? (
          <span className="shrink-0 rounded bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
            complete
          </span>
        ) : (
          <span className="shrink-0 rounded bg-status-error/10 px-1.5 py-0.5 text-xs font-medium text-status-error">
            incomplete
          </span>
        )}
      </button>
      {expanded && (
        <div className="pb-1">
          {path.steps.map((step) => (
            <button
              key={`${path.id}-${step.index}`}
              onClick={() => onHighlight(step.nodeId)}
              className="flex w-full items-center gap-2 px-6 py-1 text-left text-xs transition-colors hover:bg-muted/50"
            >
              <span className="w-4 shrink-0 text-right text-muted-foreground/40">{step.index}</span>
              <span className="shrink-0 text-foreground/60">{step.nodeName}</span>
              <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-xs text-muted-foreground/60">
                {NODE_TYPE_LABELS[step.nodeType] ?? step.nodeType}
              </span>
              <span
                className={cn(
                  'min-w-0 truncate',
                  STATUS_COLORS[step.status] ?? 'text-muted-foreground',
                )}
              >
                {step.detail}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SimulationPanel() {
  const simulationResult = useWorkflowStore((s) => s.simulationResult)
  const clearSimulation = useWorkflowStore((s) => s.clearSimulation)
  const highlightNode = useHighlightNode()

  if (!simulationResult) return null

  const { paths, issues } = simulationResult
  const allComplete = paths.length > 0 && paths.every((p) => p.completed) && issues.length === 0

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[280px] flex-col border-t border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground/60">Simulation</span>
          <span className="flex items-center gap-1 rounded-full bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
            {paths.length} path{paths.length !== 1 ? 's' : ''}
          </span>
          {issues.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-status-error/10 px-1.5 py-0.5 text-xs font-medium text-status-error">
              <AlertCircle className="h-3 w-3" />
              {issues.length}
            </span>
          )}
          {allComplete && (
            <span className="flex items-center gap-1 rounded-full bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
              <CheckCircle2 className="h-3 w-3" />
              All {paths.length} paths complete
            </span>
          )}
        </div>
        <button
          onClick={clearSimulation}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {paths.map((path) => (
          <PathSection key={path.id} path={path} onHighlight={highlightNode} />
        ))}

        {issues.length > 0 && (
          <div className="border-t border-border">
            {issues.map((issue, idx) => (
              <button
                key={idx}
                onClick={() => issue.nodeId && highlightNode(issue.nodeId)}
                disabled={!issue.nodeId}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  issue.nodeId ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
                )}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-error" />
                {issue.nodeName && (
                  <span className="shrink-0 text-muted-foreground">{issue.nodeName}</span>
                )}
                <span className="text-status-error/80">{issue.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
