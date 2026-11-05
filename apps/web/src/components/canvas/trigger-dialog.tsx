import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEditorScope } from '../../contexts/editor-scope-context'
import { workflowLinks } from '../../lib/workflows/detail-links'
import { useGoTo } from '../navigation/router-shell-link'
import { Play, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '../ui/button'
import { Select } from '../ui/select'
import { runAction, failureLine } from '../../lib/action-toast'
import { api } from '../../lib/api-client'
import { queries } from '../../lib/queries'
import { copyToClipboard } from '../../lib/utils'

interface WorkflowOption {
  id: string
  name: string
}

interface TriggerDialogProps {
  onClose: () => void
  workflowId: string
  deploymentId?: string
  /** When provided, shows a workflow selector (e.g. from the /runs page). */
  workflows?: WorkflowOption[]
}

export function TriggerDialog({
  onClose,
  workflowId: initialWorkflowId,
  deploymentId,
  workflows,
}: TriggerDialogProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const goTo = useGoTo()
  const scope = useEditorScope()
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialWorkflowId)
  const [picked, setPicked] = useState<string | null>(null)
  const [paramsJson, setParamsJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [curlCopied, setCurlCopied] = useState(false)

  // A trigger may only name an account the workflow went out with (the API holds
  // it to that), whether or not the project still has it: its latest first.
  const targets = useQuery(queries.connections.forDeploy(selectedWorkflowId))
  const connections = targets.data?.deployedWith
  const connectionId = picked ?? connections?.[0]?.id ?? ''

  function handleWorkflowChange(id: string) {
    setSelectedWorkflowId(id)
    setPicked(null)
  }

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

    let params: unknown = undefined
    try {
      const trimmed = paramsJson.trim()
      if (trimmed && trimmed !== '{}') params = JSON.parse(trimmed)
    } catch (err) {
      // The payload is on screen: said here, not as a toast.
      setError(err instanceof Error ? err.message : 'Invalid JSON')
      setTriggering(false)
      return
    }

    try {
      const run = await runAction(
        api.triggerWorkflow(selectedWorkflowId, { connectionId, params }),
        {
          success: 'Workflow triggered',
          error: 'Couldn’t trigger the workflow',
        },
      )
      queryClient.invalidateQueries({ queryKey: ['workflow-runs', selectedWorkflowId] })
      queryClient.invalidateQueries({ queryKey: ['all-runs'] })
      onClose()
      // In a workspace, the run just started opens; the old pages list all runs.
      if (scope) goTo(workflowLinks(scope, selectedWorkflowId).run(run.id))
      else navigate({ to: '/runs' })
    } catch (err) {
      setError(failureLine(err, 'Failed to trigger workflow'))
    } finally {
      setTriggering(false)
    }
  }, [connectionId, paramsJson, selectedWorkflowId, queryClient, onClose, navigate, goTo, scope])

  const handleCopyCurl = useCallback(() => {
    if (!deploymentId) return
    const trimmed = paramsJson.trim()
    const hasParams = trimmed && trimmed !== '{}'
    const curl = hasParams
      ? `curl -X POST https://${deploymentId}.workers.dev \\\n  -H "Content-Type: application/json" \\\n  -d '${trimmed}'`
      : `curl -X POST https://${deploymentId}.workers.dev`
    copyToClipboard(curl)
    setCurlCopied(true)
    setTimeout(() => setCurlCopied(false), 2000)
  }, [deploymentId, paramsJson])

  function handleOpenChange(v: boolean) {
    if (!v) onClose()
  }

  return (
    <Dialog.Root defaultOpen onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-card p-6 shadow-lg">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Play className="h-5 w-5" />
            Trigger Workflow
          </Dialog.Title>

          <div className="mt-4 space-y-4">
            {workflows && workflows.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Workflow</label>
                <Select
                  value={selectedWorkflowId}
                  onValueChange={handleWorkflowChange}
                  options={workflows.map((w) => ({ value: w.id, label: w.name }))}
                  className="w-full"
                />
              </div>
            )}

            {connections && connections.length > 0 ? (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Connection</label>
                <Select
                  value={connectionId}
                  onValueChange={setPicked}
                  options={connections.map((c) => ({ value: c.id, label: c.name }))}
                  className="w-full"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                This workflow isn’t deployed yet. Deploy it first.
              </p>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Trigger Payload (JSON)</label>
                {jsonError && (
                  <span className="flex items-center gap-1 text-xs text-status-error">
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
                    className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {curlCopied ? (
                      <Check className="h-3 w-3 text-status-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {curlCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  {`curl -X POST https://${deploymentId}.workers.dev`}
                </pre>
              </div>
            )}

            {error && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
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
