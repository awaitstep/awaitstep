import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api-client'

export type LocalDevState = 'idle' | 'starting' | 'running' | 'stopping' | 'error'

interface LocalDevInfo {
  port: number
  url: string
  pid: number
}

export interface LogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  text: string
}

export function useLocalDev(workflowId: string) {
  const [state, setState] = useState<LocalDevState>('idle')
  const [info, setInfo] = useState<LocalDevInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [triggerResult, setTriggerResult] = useState<unknown>(null)
  const [instanceId, setInstanceId] = useState<string | null>(null)
  const [instanceStatus, setInstanceStatus] = useState<unknown>(null)
  const [isTriggering, setIsTriggering] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logCursorRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startLogPolling() {
    logCursorRef.current = 0
    setLogs([])
    pollRef.current = setInterval(async () => {
      try {
        const newLogs = await api.getLocalDevLogs(workflowId, logCursorRef.current)
        if (newLogs.length > 0) {
          setLogs((prev) => [...prev, ...newLogs].slice(-500))
          logCursorRef.current = newLogs[newLogs.length - 1].timestamp
        }
      } catch {
        // Session may have ended
      }
    }, 1_000)
  }

  function stopLogPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => stopLogPolling()
  }, [])

  const start = useCallback(
    async (port?: number) => {
      setState('starting')
      setError(null)
      setTriggerResult(null)
      setInstanceId(null)
      setInstanceStatus(null)
      setLogs([])
      try {
        const result = await api.startLocalDev(workflowId, port ? { port } : undefined)
        setInfo({ port: result.port, url: result.url, pid: result.pid })
        setState('running')
        startLogPolling()
        toast.success('Local dev server started', { description: result.url })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to start'
        setError(msg)
        setState('error')
        toast.error('Failed to start local dev', { description: msg })
      }
    },
    [workflowId],
  )

  const stop = useCallback(async () => {
    setState('stopping')
    stopLogPolling()
    try {
      await api.stopLocalDev(workflowId)
      setInfo(null)
      setState('idle')
      setTriggerResult(null)
      toast.success('Local dev server stopped')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop'
      setError(msg)
      setState('error')
    }
  }, [workflowId])

  const trigger = useCallback(
    async (params?: unknown) => {
      setIsTriggering(true)
      setTriggerResult(null)
      setInstanceId(null)
      setInstanceStatus(null)
      try {
        const result = await api.triggerLocalDev(workflowId, params)
        setTriggerResult(result)
        const id = (result as { instanceId?: string })?.instanceId
        if (id) setInstanceId(id)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to trigger'
        toast.error('Trigger failed', { description: msg })
        throw err
      } finally {
        setIsTriggering(false)
      }
    },
    [workflowId],
  )

  const checkInstance = useCallback(async () => {
    if (!instanceId) return
    try {
      const status = await api.getLocalDevInstance(workflowId, instanceId)
      setInstanceStatus(status)
      return status
    } catch {
      // Instance may not exist yet
    }
  }, [workflowId, instanceId])

  return {
    state,
    info,
    error,
    triggerResult,
    instanceId,
    instanceStatus,
    isTriggering,
    logs,
    start,
    stop,
    trigger,
    checkInstance,
  }
}
