import { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../lib/api-client'

export type LocalDevState = 'idle' | 'starting' | 'running' | 'stopping' | 'error'

export interface LogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export function useLocalDev(workflowId: string) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<LocalDevState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [triggerResult, setTriggerResult] = useState<unknown>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)

  const isRunning = state === 'running'

  // ── Status polling ─────────────────────────────────
  const { data: status } = useQuery({
    queryKey: ['local-dev-status', workflowId],
    queryFn: () => api.getLocalDevStatus(workflowId),
    refetchInterval: 5_000,
  })

  // ── Log polling (only when running) ────────────────
  const { data: logs = [] } = useQuery({
    queryKey: ['local-dev-logs', workflowId],
    queryFn: () => api.getLocalDevLogs(workflowId),
    refetchInterval: isRunning ? 1_000 : false,
    enabled: isRunning,
  })

  // ── Instance status polling ────────────────────────
  const { data: instanceStatus } = useQuery({
    queryKey: ['local-dev-instance', workflowId, instanceId],
    queryFn: () => api.getLocalDevInstance(workflowId, instanceId!),
    enabled: isRunning && !!instanceId,
    refetchInterval: isRunning && !!instanceId ? 2_000 : false,
  })

  // ── Start ──────────────────────────────────────────
  const start = useCallback(async () => {
    setState('starting')
    setError(null)
    setTriggerResult(null)
    setInstanceId(null)
    try {
      const result = await api.startLocalDev(workflowId)
      setState('running')
      queryClient.invalidateQueries({ queryKey: ['local-dev-status', workflowId] })
      toast.success('Local dev server started', { description: result.url })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start'
      setError(msg)
      setState('error')
      toast.error('Failed to start local dev', { description: msg })
    }
  }, [workflowId, queryClient])

  // ── Stop ───────────────────────────────────────────
  const stop = useCallback(async () => {
    setState('stopping')
    try {
      await api.stopLocalDev(workflowId)
      setState('idle')
      setTriggerResult(null)
      setInstanceId(null)
      queryClient.invalidateQueries({ queryKey: ['local-dev-status', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['local-dev-logs', workflowId] })
      toast.success('Local dev server stopped')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop'
      setError(msg)
      setState('error')
    }
  }, [workflowId, queryClient])

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
    info: status?.active ? { port: status.port, url: status.url } : null,
    error,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering: triggerMutation.isPending,
    logs,
    start,
    stop,
    trigger: triggerMutation.mutateAsync,
    checkInstance: () =>
      queryClient.invalidateQueries({ queryKey: ['local-dev-instance', workflowId, instanceId] }),
  }
}
