import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { projectUrl } from '../lib/api-client'

const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated'])
const POLL_INTERVAL = 5_000

interface Run {
  id: string
  workflowId: string
  status: string
}

/**
 * Polls individual run endpoints for any active (non-terminal) runs in the list.
 * When a run's status changes to terminal, invalidates the list query so the
 * table refreshes with accurate data from the DB.
 */
export function useActiveRunSync(runs: Run[] | undefined, listQueryKey: string[]) {
  const queryClient = useQueryClient()
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)
  const prevStatuses = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)

    const activeRuns = runs?.filter((r) => !TERMINAL_STATUSES.has(r.status)) ?? []
    if (activeRuns.length === 0) return

    // Track current statuses
    for (const run of runs ?? []) {
      prevStatuses.current.set(run.id, run.status)
    }

    const poll = async () => {
      let changed = false

      await Promise.allSettled(
        activeRuns.map(async (run) => {
          try {
            const res = await fetch(projectUrl(`/workflows/${run.workflowId}/runs/${run.id}`), {
              credentials: 'include',
            })
            if (!res.ok) return
            const data = await res.json() as { status: string }
            const prev = prevStatuses.current.get(run.id)
            if (data.status !== prev) {
              prevStatuses.current.set(run.id, data.status)
              changed = true
            }
          } catch {
            // ignore
          }
        }),
      )

      if (changed) {
        queryClient.invalidateQueries({ queryKey: listQueryKey })
      }
    }

    // Initial poll after short delay
    const timeout = setTimeout(poll, 1_000)
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return () => {
      clearTimeout(timeout)
      clearInterval(intervalRef.current)
    }
  }, [
    // Re-run when active run IDs change
    runs?.filter((r) => !TERMINAL_STATUSES.has(r.status)).map((r) => r.id).join(','),
    queryClient,
    listQueryKey,
  ])
}
