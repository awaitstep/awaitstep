import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  /** The grey line under the value: "Updated 2h ago by Ama". */
  detail: ReactNode
}

/** One of the three cards across a workflow's Overview (`WorkflowDetail`): VERSION, DEPLOYMENT, RUNS, 24H. */
export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card px-5 py-4">
      <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
    </div>
  )
}
