import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { projectUrl } from '../lib/api-client'
import { readSseStream } from '../lib/sse-stream'

interface UseRunStreamOptions {
  workflowId: string
  runId: string
  /** Open the stream only while the run can still change. */
  enabled: boolean
}

const REFRESH_COALESCE_MS = 250

/**
 * Subscribes to the run's live event stream and refreshes the run + steps
 * queries as events arrive, coalescing bursts into one refetch. The stream
 * only accelerates what the 5s polling already guarantees — any close,
 * error, or timeout simply leaves polling as the floor, so there is no
 * reconnect logic to get wrong.
 */
export function useRunStream({ workflowId, runId, enabled }: UseRunStreamOptions): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRefresh = () => {
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        void queryClient.invalidateQueries({ queryKey: ['workflow-run-steps', workflowId, runId] })
        void queryClient.invalidateQueries({ queryKey: ['workflow-run', workflowId, runId] })
      }, REFRESH_COALESCE_MS)
    }

    const consume = async () => {
      const response = await fetch(projectUrl(`/workflows/${workflowId}/runs/${runId}/stream`), {
        credentials: 'include',
        signal: controller.signal,
      })
      if (!response.ok) return
      await readSseStream(
        response,
        (event) => {
          if (event.event === 'run' || event.event === 'step' || event.event === 'done') {
            scheduleRefresh()
          }
        },
        controller.signal,
      )
    }

    consume().catch(() => {
      // Aborted on unmount, or the stream failed: polling remains the floor.
    })

    return () => {
      controller.abort()
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [enabled, workflowId, runId, queryClient])
}
