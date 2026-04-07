import { Handle, Position, useNodeId } from '@xyflow/react'
import { useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { useRunOverlayStore } from '../../stores/run-overlay-store'
import { useWorkflowStore } from '../../stores/workflow-store'

interface NodeBaseProps {
  label: string
  icon: ReactNode
  accent: string
  selected?: boolean
  warning?: boolean
  children?: ReactNode
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
  const stepStatus = nodeId ? nodeStatuses[nodeId] : undefined

  return (
    <div
      className={cn(
        'group relative w-[140px] rounded border border-border bg-card shadow-md transition-all duration-150',
        selected &&
          'border-primary/60 shadow-[0_0_0_1px_oklch(0.696_0.17_162.48/0.3),0_2px_8px_rgba(0,0,0,0.5)]',
        overlayActive && stepStatus && !selected && STATUS_STYLES[stepStatus],
      )}
    >
      {warning && !overlayActive && (
        <div
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card bg-amber-500"
          title="Unknown node type"
        />
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
        <span className="truncate text-[10px] font-medium leading-tight text-foreground">
          {label}
        </span>
      </div>

      {children && (
        <div className="border-t border-border px-1.5 py-0.5 text-[9px] leading-tight text-muted-foreground/60 truncate">
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
