import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { projectUrl } from '../lib/api-client'
import { parseSseChunk } from '../lib/parse-sse'
import { usePollingStore } from '../stores/polling-store'

export interface DeployProgress {
  stage: string
  message: string
  progress: number
}

export interface DeployResult {
  success: boolean
  deploymentId: string
  url?: string
  dashboardUrl?: string
  error?: string
}

export type DeployState = 'idle' | 'deploying' | 'success' | 'error'

interface UseDeployStreamOptions {
  workflowId: string
  versionId?: string
}

export function useDeployStream({ workflowId, versionId }: UseDeployStreamOptions) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<DeployState>('idle')
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DeployResult | null>(null)

  function invalidateDeployQueries() {
    queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['workflows'] })
    queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
  }

  const startDeploy = useCallback(
    async (connectionId: string) => {
      setState('deploying')
      setError(null)
      setProgress(null)
      setResult(null)

      try {
        const response = await fetch(projectUrl(`/workflows/${workflowId}/deploy-stream`), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectionId, ...(versionId && { versionId }) }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new Error(body?.error ?? `Deploy request failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const { events, buffer: newBuffer } = parseSseChunk(
            buffer,
            decoder.decode(value, { stream: true }),
          )
          buffer = newBuffer

          for (const event of events) {
            const data = JSON.parse(event.data)

            if (data.stage) {
              setProgress(data)
              if (data.stage === 'FAILED') {
                setError(data.message)
                setState('error')
                toast.error('Deployment failed', { description: data.message })
                return
              }
            }

            if (data.success !== undefined) {
              setResult(data)
              if (data.success) {
                setState('success')
                invalidateDeployQueries()
                usePollingStore.getState().start('all-deployments')
                setTimeout(() => usePollingStore.getState().stop('all-deployments'), 30_000)
                toast.success('Deployed successfully')
              } else {
                const msg = data.error ?? 'Deploy failed'
                setError(msg)
                setState('error')
                toast.error('Deployment failed', { description: msg })
              }
              return
            }
          }
        }

        // Stream ended without result event — treat as success
        setState('success')
        invalidateDeployQueries()
        toast.success('Deployed successfully')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        setState('error')
        toast.error('Deployment failed', { description: msg })
      }
    },
    [workflowId, versionId, queryClient],
  )

  function retry() {
    setState('idle')
    setError(null)
  }

  return { state, progress, error, result, startDeploy, retry }
}
