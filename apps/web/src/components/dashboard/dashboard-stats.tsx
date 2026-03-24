import { useMemo } from 'react'
import { Workflow, Activity, AlertTriangle } from 'lucide-react'
import { useWorkflowsStore } from '../../stores/workflows-store'
import { useRunsStore } from '../../stores/runs-store'
import { StatCard } from './stat-card'
import { useShallow } from 'zustand/react/shallow'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function DashboardStats() {
  const { workflows, wfLoading } = useWorkflowsStore(
    useShallow((s) => ({ workflows: s.workflows, wfLoading: s.fetchState !== 'success' })),
  )
  const { runs, runLoading } = useRunsStore(
    useShallow((s) => ({ runs: s.runs, runLoading: s.fetchState !== 'success' })),
  )

  const totalWorkflows = workflows.length
  const runningNow = useMemo(
    () => runs.filter((r) => r.status === 'running' || r.status === 'queued').length,
    [runs],
  )
  const errorsWeek = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS
    return runs.filter((r) => r.status === 'errored' && new Date(r.createdAt).getTime() > cutoff)
      .length
  }, [runs])

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      <StatCard icon={Workflow} value={totalWorkflows} label="Workflows" loading={wfLoading} />
      <StatCard icon={Activity} value={runningNow} label="Running" loading={runLoading} />
      <StatCard
        icon={AlertTriangle}
        value={errorsWeek}
        label="Errors (7d)"
        loading={runLoading}
        variant={errorsWeek > 0 ? 'warning' : undefined}
      />
    </div>
  )
}
