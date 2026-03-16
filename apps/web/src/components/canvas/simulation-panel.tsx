import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { SimulationPath, SimulationStep } from '../../lib/simulate-workflow'
import { cn } from '../../lib/utils'

const NODE_TYPE_LABELS: Record<string, string> = {
  step: 'Step',
  sleep: 'Sleep',
  'sleep-until': 'Sleep Until',
  branch: 'Branch',
  parallel: 'Parallel',
  'http-request': 'HTTP',
  'wait-for-event': 'Event',
}

const STATUS_COLORS: Record<string, string> = {
  executed: 'text-emerald-400',
  'skipped-instant': 'text-yellow-400',
  'event-received': 'text-blue-400',
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
    <div className="border-b border-white/[0.04] last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.04]"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-white/30" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-white/30" />
        )}
        <span className="min-w-0 flex-1 truncate text-white/70">{path.label}</span>
        {path.completed ? (
          <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            complete
          </span>
        ) : (
          <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
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
              className="flex w-full items-center gap-2 px-6 py-1 text-left text-[11px] transition-colors hover:bg-white/[0.04]"
            >
              <span className="w-4 shrink-0 text-right text-white/20">{step.index}</span>
              <span className="shrink-0 text-white/60">{step.nodeName}</span>
              <span className="shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-white/30">
                {NODE_TYPE_LABELS[step.nodeType] ?? step.nodeType}
              </span>
              <span className={cn('min-w-0 truncate', STATUS_COLORS[step.status] ?? 'text-white/40')}>
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
  const selectNode = useWorkflowStore((s) => s.selectNode)
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
    <div className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[280px] flex-col border-t border-white/[0.06] bg-[oklch(0.13_0_0)] shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-white/60">Simulation</span>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            {paths.length} path{paths.length !== 1 ? 's' : ''}
          </span>
          {issues.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
              <AlertCircle className="h-3 w-3" />
              {issues.length}
            </span>
          )}
          {allComplete && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              All {paths.length} paths complete
            </span>
          )}
        </div>
        <button
          onClick={clearSimulation}
          className="rounded p-0.5 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
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
          <div className="border-t border-white/[0.06]">
            {issues.map((issue, idx) => (
              <button
                key={idx}
                onClick={() => handleClickIssue(issue.nodeId)}
                disabled={!issue.nodeId}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors',
                  issue.nodeId ? 'cursor-pointer hover:bg-white/[0.04]' : 'cursor-default',
                )}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                {issue.nodeName && (
                  <span className="shrink-0 text-white/50">{issue.nodeName}</span>
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
