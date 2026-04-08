import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../stores/workflow-store'
import { useShallow } from 'zustand/react/shallow'
import type { PublishIssue } from '../../lib/validate-workflow'
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

export function ValidationPanel() {
  const { validationResult, nodes } = useWorkflowStore(
    useShallow((s) => ({ validationResult: s.validationResult, nodes: s.nodes })),
  )
  const { clearValidation, selectNode } = useWorkflowStore()
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
          <span className="text-xs font-medium text-foreground/60">Publish Check</span>
          {errors.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-status-error/10 px-1.5 py-0.5 text-xs font-medium text-status-error">
              <AlertCircle className="h-3 w-3" />
              {errors.length}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-status-warning/10 px-1.5 py-0.5 text-xs font-medium text-status-warning">
              <AlertTriangle className="h-3 w-3" />
              {warnings.length}
            </span>
          )}
          {validationResult.canPublish && errors.length === 0 && (
            <span className="flex items-center gap-1 rounded-full bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
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
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-status-success/80">
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
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                  issue.nodeId ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
                )}
              >
                {issue.severity === 'error' ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-status-error" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-status-warning" />
                )}
                {issue.nodeName && (
                  <span className="shrink-0 text-muted-foreground">{issue.nodeName}</span>
                )}
                {nodeType && (
                  <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-xs text-muted-foreground/60">
                    {NODE_TYPE_LABELS[nodeType] ?? nodeType}
                  </span>
                )}
                <span
                  className={
                    issue.severity === 'error' ? 'text-status-error/80' : 'text-status-warning/80'
                  }
                >
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
