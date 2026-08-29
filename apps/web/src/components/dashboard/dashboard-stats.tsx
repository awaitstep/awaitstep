import { useMemo } from 'react'
import { Workflow, Activity, AlertTriangle, Globe } from 'lucide-react'
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
  const deployedCount = useMemo(
    () => workflows.filter((w) => w.deployStatus === 'success').length,
    [workflows],
  )
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
    <div className="mt-5 grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      <StatCard
        icon={Workflow}
        value={totalWorkflows}
        label="Workflows"
        loading={wfLoading}
        to="/workflows"
      />
      <StatCard
        icon={Globe}
        value={deployedCount}
        label="Deployed"
        loading={wfLoading}
        to="/workflows"
      />
      <StatCard
        icon={Activity}
        value={runningNow}
        label="Running"
        loading={runLoading}
        to="/runs"
      />
      <StatCard
        icon={AlertTriangle}
        value={errorsWeek}
        label="Errors (7d)"
        loading={runLoading}
        to="/runs"
        tone="error"
      />
    </div>
  )
}
