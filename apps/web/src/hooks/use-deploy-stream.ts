import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { actionToast, failureLine } from '../lib/action-toast'
import { ApiError } from '../lib/api-client'
import { readSseStream } from '../lib/sse-stream'
import { usePollingStore } from '../stores/polling-store'
import { useApi } from '../contexts/api-client-context'
import { pathSegment } from '../lib/api-path'

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

/**
 * Who ended a failed deploy: the server said so (a refusal, a FAILED stage, a
 * failed result), or the page lost the stream and can't tell how it went —
 * the server keeps deploying without it.
 */
export type DeployFailure = 'server' | 'connection'

const LOST_STREAM = 'Lost the connection before the deploy finished. It may still be deploying.'

interface UseDeployStreamOptions {
  workflowId: string
  versionId?: string
}

// For a failure that brings no reason of its own (a 5xx, a lost connection).
const DEPLOY_FAILED = 'Couldn’t deploy the workflow'

export function useDeployStream({ workflowId, versionId }: UseDeployStreamOptions) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [state, setState] = useState<DeployState>('idle')
  const [progress, setProgress] = useState<DeployProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DeployResult | null>(null)
  // The last real stage reached (FAILED carries none): where a failed deploy stopped.
  const [reachedStage, setReachedStage] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [failure, setFailure] = useState<DeployFailure | null>(null)

  function invalidateDeployQueries() {
    queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['workflows'] })
    queryClient.invalidateQueries({ queryKey: ['deployments', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['all-deployments'] })
    // What is live on each account: the overview's and the editor's.
    queryClient.invalidateQueries({ queryKey: ['deploy-connections', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['workflow-full', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-summary', workflowId] })
    // The settings each account stores, saved by a successful deploy: Deploy
    // must start from them, not from what it cached before.
    queryClient.invalidateQueries({ queryKey: ['deploy-config', workflowId] })
    queryClient.invalidateQueries({ queryKey: ['deploy-config-preview', workflowId] })
  }

  function lostTrack() {
    setError(LOST_STREAM)
    setFailure('connection')
    setFinishedAt(Date.now())
    setState('error')
    // It may have gone out: what is live, and the stored settings, are read again.
    invalidateDeployQueries()
    actionToast.error(LOST_STREAM)
  }

  const startDeploy = useCallback(
    async (connectionId: string, config?: Record<string, unknown>) => {
      setState('deploying')
      setError(null)
      setProgress(null)
      setResult(null)
      setReachedStage(null)
      setStartedAt(Date.now())
      setFinishedAt(null)
      setFailure(null)

      try {
        const response = await fetch(
          api.projectUrl(`/workflows/${pathSegment(workflowId)}/deploy-stream`),
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
            if (data.stage !== 'FAILED') setReachedStage(data.stage)
            if (data.stage === 'FAILED') {
              setError(data.message)
              setFailure('server')
              setFinishedAt(Date.now())
              setState('error')
              actionToast.error(data.message || DEPLOY_FAILED)
              settled = true
              return false
            }
          }

          if (data.success !== undefined) {
            setResult(data)
            setFinishedAt(Date.now())
            if (data.success) {
              setState('success')
              invalidateDeployQueries()
              usePollingStore.getState().start('all-deployments')
              setTimeout(() => usePollingStore.getState().stop('all-deployments'), 30_000)
              actionToast.success('Workflow deployed')
            } else {
              const msg = data.error ?? 'Deploy failed'
              setError(msg)
              setFailure('server')
              setState('error')
              actionToast.error(msg)
            }
            settled = true
            return false
          }
          return true
        })
        if (settled) return

        // The stream ended without a result: nothing says it went live.
        lostTrack()
      } catch (err) {
        // A refusal is the server's answer; anything else (no answer, a dropped
        // stream, a broken read) may have happened after the deploy started.
        if (err instanceof ApiError) {
          const msg = failureLine(err, DEPLOY_FAILED)
          setError(msg)
          setFailure('server')
          setFinishedAt(Date.now())
          setState('error')
          actionToast.error(msg)
        } else {
          lostTrack()
        }
      }
    },
    [api, workflowId, versionId, queryClient],
  )

  function retry() {
    setState('idle')
    setError(null)
    setFailure(null)
  }

  return {
    state,
    progress,
    error,
    result,
    reachedStage,
    startedAt,
    finishedAt,
    failure,
    startDeploy,
    retry,
  }
}
