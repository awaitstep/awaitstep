import { useNodeId } from '@xyflow/react'
import { useCallback, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getNodeVisuals } from '../../lib/node-icon-map'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { useRunOverlayStore, type StepStatus } from '../../stores/run-overlay-store'
import { useShallow } from 'zustand/react/shallow'
import { useWorkflowStore } from '../../stores/workflow-store'
import { NodeHandles } from './node-handles'

interface NodeBaseProps {
  label: string
  /** The IR node type: picks the icon, the kind colour and the kind line. */
  nodeType: string
  /** Replaces the kind line (a Library node reads "Custom node"). */
  kind?: string
  /** A short chip at the right, such as a Library node's version. */
  chip?: string
  selected?: boolean
  warning?: boolean
  /** One line of the node's config, under the header. */
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

const STATUS_BORDER: Record<StepStatus, string> = {
  complete: 'border-status-success/50',
  running: 'border-status-info/65 ring-[3px] ring-status-info/15',
  errored: 'border-status-error/65 ring-[3px] ring-status-error/12',
  timed_out: 'border-status-warning/65 ring-[3px] ring-status-warning/12',
  pending: 'opacity-60',
  skipped: 'opacity-30',
}

/** The chip a run puts in the node's header (board 31a, "During a run"). */
const STATUS_CHIP: Partial<Record<StepStatus, { text: string; className: string }>> = {
  running: { text: 'Running', className: 'bg-status-info/15 text-status-info' },
  complete: { text: 'Done', className: 'bg-status-success/15 text-status-success' },
  errored: { text: 'Failed', className: 'bg-status-error/15 text-status-error' },
  timed_out: { text: 'Timed out', className: 'bg-status-warning/15 text-status-warning' },
}

/** A canvas node (board 31a): kind rail, icon tile, name over kind, one config line. */
export function NodeBase({
  label,
  nodeType,
  kind,
  chip,
  selected = false,
  warning,
  children,
}: NodeBaseProps) {
  const nodeId = useNodeId()
  const { registry } = useNodeRegistry()
  const definition = registry.get(nodeType)
  const visuals = getNodeVisuals(nodeType, definition?.icon)
  const kindLine = kind ?? definition?.name ?? nodeType
  const { active: overlayActive, nodeStatuses } = useRunOverlayStore()
  const stepStatus =
    nodeId && Object.hasOwn(nodeStatuses, nodeId) ? nodeStatuses[nodeId] : undefined
  const runStatus = overlayActive ? stepStatus : undefined
  const statusChip = runStatus ? STATUS_CHIP[runStatus] : undefined
  const issue = useNodeIssue(nodeId)
  const badge = overlayActive
    ? null
    : issue
      ? {
          className: issue.severity === 'error' ? 'bg-status-error' : 'bg-status-warning',
          title: issue.message,
        }
      : warning
        ? { className: 'bg-status-warning', title: 'Unknown node type' }
        : null

  return (
    <div
      className={cn(
        'group relative w-[220px] rounded-[12px] border border-border bg-card transition-[border-color,box-shadow,opacity] duration-150 hover:shadow-[0_8px_24px_rgb(0_0_0/0.45)]',
        runStatus && !selected && STATUS_BORDER[runStatus],
        selected && 'border-primary ring-[3px] ring-primary/20',
        // A run overlay owns the border while it is active; outside a run,
        // validation errors take precedence over the selected border.
        !overlayActive && issue?.severity === 'error' && 'border-status-error/70',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-full', visuals.rail)}
      />
      {badge && (
        <div
          className={cn(
            'absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card',
            badge.className,
          )}
          title={badge.title}
        />
      )}

      <div className="flex items-center gap-2 py-[9px] pl-3 pr-2.5">
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] [&_img]:size-3.5 [&_svg]:size-3.5',
            visuals.accent,
          )}
        >
          {visuals.paletteIcon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-tight text-foreground">
            {label}
          </span>
          <span className="truncate text-2xs leading-tight text-muted-foreground">{kindLine}</span>
        </div>
        {statusChip ? (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs',
              statusChip.className,
            )}
          >
            {runStatus === 'running' && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}
            {statusChip.text}
          </span>
        ) : (
          chip && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-2xs text-muted-foreground">
              {chip}
            </span>
          )
        )}
      </div>

      {children && (
        <div className="truncate border-t border-border/60 py-1.5 pl-3 pr-2.5 font-mono text-2xs text-muted-foreground">
          {children}
        </div>
      )}

      {nodeId && <NodeHandles nodeId={nodeId} nodeName={label} selected={selected} />}
    </div>
  )
}
