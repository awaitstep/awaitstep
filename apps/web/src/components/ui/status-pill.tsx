import type { ReactNode } from 'react'
import { Badge, type BadgeProps } from './badge'

export type PillStatus = 'deployed' | 'draft' | 'failed' | 'running' | 'succeeded' | 'shared'

const STATUS_LOOK: Record<PillStatus, { label: string; variant: BadgeProps['variant'] }> = {
  deployed: { label: 'Deployed', variant: 'success' },
  draft: { label: 'Draft', variant: 'neutral' },
  failed: { label: 'Failed', variant: 'error' },
  running: { label: 'Running', variant: 'warning' },
  succeeded: { label: 'Succeeded', variant: 'success' },
  shared: { label: 'Shared', variant: 'info' },
}

interface StatusPillProps {
  status: PillStatus
  /** Replaces the default label, e.g. "Deployed · v12". */
  children?: ReactNode
}

/** A workflow, run or item status. The word carries it; the colour repeats it. */
export function StatusPill({ status, children }: StatusPillProps) {
  const look = STATUS_LOOK[status]
  return (
    <Badge variant={look.variant} dot>
      {children ?? look.label}
    </Badge>
  )
}
