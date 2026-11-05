import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { actionToast, failureLine } from '../lib/action-toast'
import { ApiError, projectUrl } from '../lib/api-client'
import { readSseStream } from '../lib/sse-stream'
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

// For a failure that brings no reason of its own (a 5xx, a lost connection).
const DEPLOY_FAILED = 'Couldn’t deploy the workflow'

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
    async (connectionId: string, config?: Record<string, unknown>) => {
      setState('deploying')
      setError(null)
      setProgress(null)
      setResult(null)

      try {
        const response = await fetch(
          projectUrl(`/workflows/${encodeURIComponent(workflowId)}/deploy-stream`),
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              connectionId,
              ...(versionId && { versionId }),
              ...(config && { config }),
            }),
          },
        )

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new ApiError(
            body?.error ?? `Deploy request failed: ${response.status}`,
            response.status,
          )
        }

        // `settled` keeps the original control flow: a stage failure or a
        // result ends the deploy, and only a stream that ended without
        // either falls through to the optimistic success below.
        let settled = false
        await readSseStream(response, (event) => {
          const data = JSON.parse(event.data)

          if (data.stage) {
            setProgress(data)
            if (data.stage === 'FAILED') {
              setError(data.message)
              setState('error')
              actionToast.error(data.message || DEPLOY_FAILED)
              settled = true
              return false
            }
          }

          if (data.success !== undefined) {
            setResult(data)
            if (data.success) {
              setState('success')
              invalidateDeployQueries()
              usePollingStore.getState().start('all-deployments')
              setTimeout(() => usePollingStore.getState().stop('all-deployments'), 30_000)
              actionToast.success('Workflow deployed')
            } else {
              const msg = data.error ?? 'Deploy failed'
              setError(msg)
              setState('error')
              actionToast.error(msg)
            }
            settled = true
            return false
          }
          return true
        })
        if (settled) return

        // Stream ended without result event — treat as success
        setState('success')
        invalidateDeployQueries()
        actionToast.success('Workflow deployed')
      } catch (err) {
        const msg = failureLine(err, DEPLOY_FAILED)
        setError(msg)
        setState('error')
        actionToast.error(msg)
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
