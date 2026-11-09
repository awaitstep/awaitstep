import { useCallback, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { runAction, failureLine } from '../lib/action-toast'
import { useApi } from '../contexts/api-client-context'

export type LocalDevState = 'idle' | 'starting' | 'running' | 'stopping' | 'error'

export interface LogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export function useLocalDev(workflowId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [state, setState] = useState<LocalDevState>('idle')
  const [info, setInfo] = useState<{ port: number; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [triggerResult, setTriggerResult] = useState<unknown>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)

  const isRunning = state === 'running'

  // A panel opened after the server started (or in the other workspace) finds
  // the session instead of showing a fresh Start screen.
  const { data: session } = useQuery({
    queryKey: ['local-dev-session', workflowId],
    queryFn: () => api.getLocalDevSession(workflowId),
    retry: false,
    staleTime: 5_000,
  })
  useEffect(() => {
    if (!session) return
    setState('running')
    if (session.port !== null && session.url) {
      setInfo({ port: session.port, url: session.url })
    }
  }, [session])

  // ── Log polling (only when running) ────────────────
  const { data: logs = [] } = useQuery({
    queryKey: ['local-dev-logs', workflowId],
    queryFn: () => api.getLocalDevLogs(workflowId),
    refetchInterval: isRunning ? 5_000 : false,
    gcTime: 1_000,
    enabled: isRunning,
  })

  // ── Instance status (on-demand) ────────────────────
  const { data: instanceStatus } = useQuery({
    queryKey: ['local-dev-instance', workflowId, instanceId],
    queryFn: () => api.getLocalDevInstance(workflowId, instanceId!),
    gcTime: 1_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    //@ts-expect-error: query.state.data is of type LocalDevInstance | null
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 2_000 : false),
    enabled: !!instanceId,
  })

  // ── Start ──────────────────────────────────────────
  const start = useCallback(
    async (mode: 'canvas' | 'ide' = 'canvas') => {
      setState('starting')
      setError(null)
      setTriggerResult(null)
      setInstanceId(null)
      try {
        const result = await runAction(api.startLocalDev(workflowId, mode), {
          success: 'Local dev server started',
          error: 'Couldn’t start the local dev server',
        })
        const isLocal =
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const url = isLocal
          ? `http://localhost:${result.port}`
          : `${window.location.origin}/local-dev/`
        setInfo({ port: result.port, url })
        setState('running')
        await queryClient.invalidateQueries({ queryKey: ['local-dev-session', workflowId] })
      } catch (err) {
        setError(failureLine(err, 'Failed to start'))
        setState('error')
      }
    },
    [api, queryClient, workflowId],
  )

  // ── Stop ───────────────────────────────────────────
  const stop = useCallback(async () => {
    setState('stopping')
    try {
      await runAction(api.stopLocalDev(workflowId), {
        success: 'Local dev server stopped',
        error: 'Couldn’t stop the local dev server',
      })
      setInfo(null)
      setState('idle')
      setTriggerResult(null)
      setInstanceId(null)
      await queryClient.invalidateQueries({ queryKey: ['local-dev-session', workflowId] })
    } catch (err) {
      const msg = failureLine(err, 'Failed to stop')
      setError(msg)
      setState('error')
    }
  }, [api, queryClient, workflowId])

  // ── Trigger ────────────────────────────────────────
  const triggerMutation = useMutation({
    meta: { toast: { success: 'Workflow triggered', error: 'Couldn’t trigger the workflow' } },
    mutationFn: (params?: unknown) => api.triggerLocalDev(workflowId, params),
    onSuccess: (result) => {
      setTriggerResult(result)
      const id = (result as { instanceId?: string })?.instanceId
      if (id) setInstanceId(id)
    },
  })

  // A fresh server starts without the last one's trigger failure.
  const { reset: resetTrigger } = triggerMutation
  const startFresh = useCallback(
    (mode: 'canvas' | 'ide' = 'canvas') => {
      resetTrigger()
      return start(mode)
    },
    [resetTrigger, start],
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['local-dev-session', workflowId] }),
      queryClient.invalidateQueries({ queryKey: ['local-dev-logs', workflowId] }),
      queryClient.invalidateQueries({ queryKey: ['local-dev-instance', workflowId] }),
    ])
  }, [queryClient, workflowId])

  return {
    state,
    info,
    error,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering: triggerMutation.isPending,
    triggerError: triggerMutation.error
      ? failureLine(triggerMutation.error, 'Failed to trigger')
      : null,
    logs,
    start: startFresh,
    stop,
    trigger: triggerMutation.mutate,
    refresh,
  }
}
