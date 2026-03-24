import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { SimulationPath, SimulationStep } from '../../lib/simulate-workflow'
import { cn } from '../../lib/utils'

const NODE_TYPE_LABELS: Record<string, string> = {
  step: 'Step',
  sleep: 'Sleep',
  sleep_until: 'Sleep Until',
  branch: 'Branch',
  parallel: 'Parallel',
  http_request: 'HTTP',
  wait_for_event: 'Event',
}

const STATUS_COLORS: Record<string, string> = {
  executed: 'text-status-success',
  'skipped-instant': 'text-status-warning',
  'event-received': 'text-status-info',
}

function PathSection({ path }: { path: SimulationPath }) {
  const [expanded, setExpanded] = useState(false)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const { fitView } = useReactFlow()

  function handleClickStep(step: SimulationStep) {
    selectNode(step.nodeId)
    fitView({ nodes: [{ id: step.nodeId }], duration: 300, padding: 0.5 })
  }

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        )}
        <span className="min-w-0 flex-1 truncate text-foreground/70">{path.label}</span>
        {path.completed ? (
          <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
            complete
          </span>
        ) : (
          <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-error">
            incomplete
          </span>
        )}
      </button>
      {expanded && (
        <div className="pb-1">
          {path.steps.map((step) => (
            <button
              key={`${path.id}-${step.index}`}
              onClick={() => handleClickStep(step)}
              className="flex w-full items-center gap-2 px-6 py-1 text-left text-[11px] transition-colors hover:bg-muted/50"
            >
              <span className="w-4 shrink-0 text-right text-muted-foreground/40">{step.index}</span>
              <span className="shrink-0 text-foreground/60">{step.nodeName}</span>
              <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[10px] text-muted-foreground/60">
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
  const { clearSimulation, selectNode } = useWorkflowStore()
  const { fitView } = useReactFlow()

  if (!simulationResult) return null

  const { paths, issues } = simulationResult
  const allComplete = paths.length > 0 && paths.every((p) => p.completed) && issues.length === 0

  function handleClickIssue(nodeId: string) {
    if (!nodeId) return
    selectNode(nodeId)
    fitView({ nodes: [{ id: nodeId }], duration: 300, padding: 0.5 })
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[280px] flex-col border-t border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground/60">Simulation</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
            {paths.length} path{paths.length !== 1 ? 's' : ''}
          </span>
          {issues.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-error">
              <AlertCircle className="h-3 w-3" />
              {issues.length}
            </span>
          )}
          {allComplete && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
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
          <PathSection key={path.id} path={path} />
        ))}

        {issues.length > 0 && (
          <div className="border-t border-border">
            {issues.map((issue, idx) => (
              <button
                key={idx}
                onClick={() => handleClickIssue(issue.nodeId)}
                disabled={!issue.nodeId}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors',
                  issue.nodeId ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
                )}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-error" />
                {issue.nodeName && (
                  <span className="shrink-0 text-muted-foreground">{issue.nodeName}</span>
                )}
                <span className="text-red-300/80">{issue.message}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
