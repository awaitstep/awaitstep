import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Play, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { api } from '../../lib/api-client'

interface TriggerDialogProps {
  open: boolean
  onClose: () => void
  workflowId: string
  deploymentId?: string
}

export function TriggerDialog({ open, onClose, workflowId, deploymentId }: TriggerDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [connectionId, setConnectionId] = useState('')
  const [paramsJson, setParamsJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [curlCopied, setCurlCopied] = useState(false)

  const { data: connections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => api.listConnections(),
    enabled: open,
    retry: false,
  })

  const handleParamsChange = useCallback((value: string) => {
    setParamsJson(value)
    try {
      JSON.parse(value)
      setJsonError(null)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }, [])

  const handleTrigger = useCallback(async () => {
    if (!connectionId) return
    setTriggering(true)
    setError(null)

    try {
      let params: unknown = undefined
      const trimmed = paramsJson.trim()
      if (trimmed && trimmed !== '{}') {
        params = JSON.parse(trimmed)
      }

      const run = await api.triggerWorkflow(workflowId, { connectionId, params })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      onClose()
      navigate({
        to: '/workflows/$workflowId/runs/$runId',
        params: { workflowId, runId: run.id },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger workflow')
    } finally {
      setTriggering(false)
    }
  }, [connectionId, paramsJson, workflowId, queryClient, onClose, navigate])

  const handleCopyCurl = useCallback(() => {
    if (!deploymentId) return
    const trimmed = paramsJson.trim()
    const hasParams = trimmed && trimmed !== '{}'
    const curl = hasParams
      ? `curl -X POST https://${deploymentId}.workers.dev \\\n  -H "Content-Type: application/json" \\\n  -d '${trimmed}'`
      : `curl -X POST https://${deploymentId}.workers.dev`
    navigator.clipboard.writeText(curl)
    setCurlCopied(true)
    setTimeout(() => setCurlCopied(false), 2000)
  }, [deploymentId, paramsJson])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[480px] rounded-xl border border-white/[0.08] bg-[oklch(0.14_0_0)] p-6 shadow-2xl">
        <div className="flex items-center gap-2 text-white/90">
          <Play className="h-5 w-5" />
          <h2 className="text-base font-semibold">Trigger Workflow</h2>
        </div>

        <div className="mt-4 space-y-4">
          {connections && connections.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs text-white/50">Connection</label>
              <Select
                value={connectionId}
                onValueChange={setConnectionId}
                options={connections.map((c) => ({ value: c.id, label: c.name }))}
                className="w-full"
              />
            </div>
          ) : (
            <p className="text-xs text-white/50">No connections available.</p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-white/50">Trigger Payload (JSON)</label>
              {jsonError && (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  {jsonError}
                </span>
              )}
            </div>
            <textarea
              value={paramsJson}
              onChange={(e) => handleParamsChange(e.target.value)}
              spellCheck={false}
              className="h-40 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 font-mono text-xs text-white/80 placeholder:text-white/20 focus:border-primary/40 focus:outline-none"
              placeholder='{ "key": "value" }'
            />
          </div>

          {deploymentId && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-white/50">Curl Command</label>
                <button
                  onClick={handleCopyCurl}
                  className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/50"
                >
                  {curlCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {curlCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] text-white/50">
                {`curl -X POST https://${deploymentId}.workers.dev`}
              </pre>
            </div>
          )}

          {error && (
            <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              disabled={!connectionId || !!jsonError || triggering}
              onClick={handleTrigger}
            >
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Trigger'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
