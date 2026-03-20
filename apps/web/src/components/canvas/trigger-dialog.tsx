import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Play, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
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

      await api.triggerWorkflow(workflowId, { connectionId, params })
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] })
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
      onClose()
      navigate({
        to: '/runs',
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

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Play className="h-5 w-5" />
            Trigger Workflow
          </Dialog.Title>

        <div className="mt-4 space-y-4">
          {connections && connections.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Connection</label>
              <Select
                value={connectionId}
                onValueChange={setConnectionId}
                options={connections.map((c) => ({ value: c.id, label: c.name }))}
                className="w-full"
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No connections available.</p>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Trigger Payload (JSON)</label>
              {jsonError && (
                <span className="flex items-center gap-1 text-[10px] text-status-error">
                  <AlertCircle className="h-3 w-3" />
                  {jsonError}
                </span>
              )}
            </div>
            <textarea
              value={paramsJson}
              onChange={(e) => handleParamsChange(e.target.value)}
              spellCheck={false}
              className="h-40 w-full rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
              placeholder='{ "key": "value" }'
            />
          </div>

          {deploymentId && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Curl Command</label>
                <button
                  onClick={handleCopyCurl}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {curlCopied ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                  {curlCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
