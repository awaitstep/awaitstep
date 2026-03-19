import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../stores/workflow-store'
import type { PublishIssue } from '../../lib/validate-workflow'
import { cn } from '../../lib/utils'

const NODE_TYPE_LABELS: Record<string, string> = {
  step: 'Step',
  sleep: 'Sleep',
  'sleep_until': 'Sleep Until',
  branch: 'Branch',
  parallel: 'Parallel',
  'http_request': 'HTTP',
  'wait_for_event': 'Event',
}

export function ValidationPanel() {
  const validationResult = useWorkflowStore((s) => s.validationResult)
  const clearValidation = useWorkflowStore((s) => s.clearValidation)
  const selectNode = useWorkflowStore((s) => s.selectNode)
  const nodes = useWorkflowStore((s) => s.nodes)
  const { fitView } = useReactFlow()

  if (!validationResult) return null

  const errors = validationResult.issues.filter((i) => i.severity === 'error')
  const warnings = validationResult.issues.filter((i) => i.severity === 'warning')
  const sortedIssues = [...errors, ...warnings]

  function handleClickIssue(issue: PublishIssue) {
    if (!issue.nodeId) return
    selectNode(issue.nodeId)
    fitView({ nodes: [{ id: issue.nodeId }], duration: 300, padding: 0.5 })
  }

  function getNodeType(nodeId: string): string | null {
    const node = nodes.find((n) => n.id === nodeId)
    return node?.data.irNode.type ?? null
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[240px] flex-col border-t border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground/60">Publish Check</span>
          {errors.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-error">
              <AlertCircle className="h-3 w-3" />
              {errors.length}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              {warnings.length}
            </span>
          )}
          {validationResult.canPublish && errors.length === 0 && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-status-success">
              <CheckCircle2 className="h-3 w-3" />
              Ready to deploy
            </span>
          )}
        </div>
        <button
          onClick={clearValidation}
          className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground/60"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto">
        {sortedIssues.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-status-success/80">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No issues found. Workflow is ready to deploy.
          </div>
        ) : (
          sortedIssues.map((issue, idx) => {
            const nodeType = issue.nodeId ? getNodeType(issue.nodeId) : null
            return (
              <button
                key={idx}
                onClick={() => handleClickIssue(issue)}
                disabled={!issue.nodeId}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors',
                  issue.nodeId
                    ? 'cursor-pointer hover:bg-muted/50'
                    : 'cursor-default',
                )}
              >
                {issue.severity === 'error' ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-error" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
                )}
                {issue.nodeName && (
                  <span className="shrink-0 text-muted-foreground">{issue.nodeName}</span>
                )}
                {nodeType && (
                  <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[10px] text-muted-foreground/60">
                    {NODE_TYPE_LABELS[nodeType] ?? nodeType}
                  </span>
                )}
                <span className={issue.severity === 'error' ? 'text-red-300/80' : 'text-yellow-300/80'}>
                  {issue.message}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
