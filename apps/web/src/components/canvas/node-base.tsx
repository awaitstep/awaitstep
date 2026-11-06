import { Handle, Position, useNodeId } from '@xyflow/react'
import { useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useRunOverlayStore } from '../../stores/run-overlay-store'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflow-store'

interface NodeBaseProps {
  label: string
  icon: ReactNode
  accent: string
  selected?: boolean
  warning?: boolean
  children?: ReactNode
}

/**
 * The worst validation issue reported for this node, with its message —
 * errors outrank warnings. Nodes show it as a badge so publish problems are
 * visible on the canvas, not only in the panel.
 */
function useNodeIssue(
  nodeId: string | null,
): { severity: 'error' | 'warning'; message: string } | null {
  // A new object each read: compared by value, or the store's snapshot never settles.
  return useWorkflowStore(
    useShallow(
      useCallback(
        (s) => {
          if (!nodeId || !s.validationResult) return null
          let warning: { severity: 'warning'; message: string } | null = null
          for (const issue of s.validationResult.issues) {
            if (issue.nodeId !== nodeId) continue
            if (issue.severity === 'error')
              return { severity: 'error' as const, message: issue.message }
            warning ??= { severity: 'warning' as const, message: issue.message }
          }
          return warning
        },
        [nodeId],
      ),
    ),
  )
}

const STATUS_STYLES: Record<string, string> = {
  complete: 'border-status-success/60 shadow-[0_0_6px_oklch(0.72_0.14_155/0.2)]',
  running: 'border-status-info/60 shadow-[0_0_6px_oklch(0.7_0.1_230/0.2)] animate-pulse',
  errored: 'border-status-error/60 shadow-[0_0_6px_oklch(0.68_0.17_22/0.2)]',
  pending: 'border-border opacity-60',
  skipped: 'border-border/50 opacity-30',
}

export function NodeBase({ label, icon, accent, selected, warning, children }: NodeBaseProps) {
  const nodeId = useNodeId()
  const hasIncoming = useWorkflowStore(
    useCallback((s) => s.edges.some((e) => e.target === nodeId), [nodeId]),
  )
  const hasOutgoing = useWorkflowStore(
    useCallback((s) => s.edges.some((e) => e.source === nodeId), [nodeId]),
  )
  const { active: overlayActive, nodeStatuses } = useRunOverlayStore()
  const stepStatus =
    nodeId && Object.hasOwn(nodeStatuses, nodeId) ? nodeStatuses[nodeId] : undefined
  const issue = useNodeIssue(nodeId)

  return (
    <div
      className={cn(
        'group relative w-[120px] rounded border border-border bg-card shadow-md transition-all duration-150',
        selected &&
          'border-primary/60 shadow-[0_0_0_1px_oklch(0.696_0.17_162.48/0.3),0_2px_8px_rgba(0,0,0,0.5)]',
        overlayActive && stepStatus && !selected && STATUS_STYLES[stepStatus],
        // A run overlay owns the border while it is active; outside a run,
        // validation errors take precedence over the selected ring.
        !overlayActive && issue?.severity === 'error' && 'border-status-error/70',
      )}
    >
      {issue && !overlayActive ? (
        <div
          className={cn(
            'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card',
            issue.severity === 'error' ? 'bg-status-error' : 'bg-status-warning',
          )}
          title={issue.message}
        />
      ) : (
        warning &&
        !overlayActive && (
          <div
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card bg-amber-500"
            title="Unknown node type"
          />
        )
      )}

      {overlayActive && stepStatus && stepStatus !== 'pending' && stepStatus !== 'skipped' && (
        <div
          className={cn(
            'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card',
            stepStatus === 'complete' && 'bg-status-success',
            stepStatus === 'running' && 'bg-status-info animate-pulse',
            stepStatus === 'errored' && 'bg-status-error',
          )}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!-top-[3px] !h-[6px] !w-[6px] !rounded-full !border-[1px] !border-card transition-colors group-hover:!bg-primary',
          hasIncoming
            ? '!bg-[oklch(0.5_0_0)]'
            : '!bg-transparent !border-transparent group-hover:!bg-primary group-hover:!border-card',
        )}
      />

      <div className="flex items-center gap-1 px-1.5 py-1">
        <div className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-sm', accent)}>
          {icon}
        </div>
        <span className="truncate text-[8px] font-medium leading-tight text-foreground">
          {label}
        </span>
      </div>

      {children && (
        <div className="border-t border-border px-1.5 py-0.5 text-[7px] leading-tight text-muted-foreground/60 truncate">
          {children}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          '!-bottom-[3px] !h-[6px] !w-[6px] !rounded-full !border-[1px] !border-card transition-colors group-hover:!bg-primary',
          hasOutgoing
            ? '!bg-[oklch(0.5_0_0)]'
            : '!bg-transparent !border-transparent group-hover:!bg-primary group-hover:!border-card',
        )}
      />
    </div>
  )
}
