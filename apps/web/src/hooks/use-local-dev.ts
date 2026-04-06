import { useCallback, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api-client'

export type LocalDevState = 'idle' | 'starting' | 'running' | 'stopping' | 'error'

export interface LogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export function useLocalDev(workflowId: string) {
  const [state, setState] = useState<LocalDevState>('idle')
  const [info, setInfo] = useState<{ port: number; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [triggerResult, setTriggerResult] = useState<unknown>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)

  const isRunning = state === 'running'

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
  const start = useCallback(async () => {
    setState('starting')
    setError(null)
    setTriggerResult(null)
    setInstanceId(null)
    try {
      const result = await api.startLocalDev(workflowId)
      const url = `http://${window.location.hostname}:${result.port}`
      setInfo({ port: result.port, url })
      setState('running')
      toast.success('Local dev server started', { description: url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start'
      setError(msg)
      setState('error')
      toast.error('Failed to start local dev', { description: msg })
    }
  }, [workflowId])

  // ── Stop ───────────────────────────────────────────
  const stop = useCallback(async () => {
    setState('stopping')
    try {
      await api.stopLocalDev(workflowId)
      setInfo(null)
      setState('idle')
      setTriggerResult(null)
      setInstanceId(null)
      toast.success('Local dev server stopped')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop'
      setError(msg)
      setState('error')
    }
  }, [workflowId])

  // ── Trigger ────────────────────────────────────────
  const triggerMutation = useMutation({
    mutationFn: (params?: unknown) => api.triggerLocalDev(workflowId, params),
    onSuccess: (result) => {
      setTriggerResult(result)
      const id = (result as { instanceId?: string })?.instanceId
      if (id) setInstanceId(id)
    },
    onError: (err) => {
      toast.error('Trigger failed', {
        description: err instanceof Error ? err.message : 'Failed to trigger',
      })
    },
  })

  return {
    state,
    info,
    error,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering: triggerMutation.isPending,
    logs,
    start,
    stop,
    trigger: triggerMutation.mutateAsync,
  }
}
