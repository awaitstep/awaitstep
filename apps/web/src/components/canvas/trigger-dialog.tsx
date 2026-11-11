import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useItemSlugs } from '../../contexts/editor-scope-context'
import { workflowLinks } from '../../lib/workflows/detail-links'
import { useGoTo } from '../navigation/router-shell-link'
import { Play } from 'lucide-react'
import { Button } from '../ui/button'
import { CopyCommand } from '../ui/copy-command'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Tile } from '../ui/tile'
import { runAction, failureLine } from '../../lib/action-toast'
import { runCurl } from '../../lib/workflows/run-endpoint'
import { useApi, useQueries } from '../../contexts/api-client-context'

interface WorkflowOption {
  id: string
  name: string
}

interface TriggerDialogProps {
  onClose: () => void
  workflowId: string
  /** When provided, shows a workflow selector (e.g. from the /runs page). */
  workflows?: WorkflowOption[]
}

export function TriggerDialog({
  onClose,
  workflowId: initialWorkflowId,
  workflows,
}: TriggerDialogProps) {
  const api = useApi()
  const queries = useQueries()
  const queryClient = useQueryClient()
  const goTo = useGoTo()
  const scope = useItemSlugs()
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(initialWorkflowId)
  const [picked, setPicked] = useState<string | null>(null)
  const [paramsJson, setParamsJson] = useState('{}')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      // The workflow page's run counts (its tab and the day's card).
      queryClient.invalidateQueries({ queryKey: ['dash', 'workflow-run-counts'] })
      onClose()
      // The run just started opens.
      goTo(workflowLinks(scope, selectedWorkflowId).run(run.id))
    } catch (err) {
      setError(failureLine(err, 'Failed to trigger workflow'))
    } finally {
      setTriggering(false)
    }
  }, [api, connectionId, paramsJson, selectedWorkflowId, queryClient, onClose, goTo, scope])

  function handleOpenChange(v: boolean) {
    if (!v && !triggering) onClose()
  }

  // What the picked account runs: each account may run another version.
  const deployedVersion = connections?.find((c) => c.id === connectionId)?.version
  const description =
    deployedVersion != null
      ? `Runs v${deployedVersion}, the version deployed there.`
      : 'Runs the version deployed there.'

  const curl = runCurl(selectedWorkflowId, {
    // Named only when there is a choice: alone, it is the one used.
    account: connections && connections.length > 1 ? connectionId : undefined,
    body: paramsJson,
  })

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone="ok" size="lg">
          <Play />
        </Tile>
      }
      title="Trigger a run"
      description={description}
      footerStart={
        <span className="text-xs text-muted-foreground">It appears in Runs straight away.</span>
      }
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={triggering}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleTrigger}
            disabled={!connectionId || !!jsonError}
            loading={triggering}
          >
            Trigger
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4.5">
        {workflows && workflows.length > 0 && (
          <FormField label="Workflow">
            <Select
              aria-label="Workflow"
              value={selectedWorkflowId}
              onValueChange={handleWorkflowChange}
              options={workflows.map((w) => ({ value: w.id, label: w.name }))}
            />
          </FormField>
        )}

        {connections && connections.length > 0 ? (
          <FormField label="Connection" hint="Where this run executes.">
            <Select
              aria-label="Connection"
              value={connectionId}
              onValueChange={setPicked}
              options={connections.map((c) => ({ value: c.id, label: c.name }))}
            />
          </FormField>
        ) : (
          <p className="text-sm text-muted-foreground">
            This workflow isn’t deployed yet. Deploy it first.
          </p>
        )}

        <FormField
          label="Payload (JSON)"
          hint="The workflow reads it as the trigger input."
          error={jsonError ?? undefined}
        >
          <Textarea
            value={paramsJson}
            onChange={(e) => handleParamsChange(e.target.value)}
            spellCheck={false}
            rows={6}
            className="resize-none font-mono text-xs"
            placeholder='{ "key": "value" }'
          />
        </FormField>

        {connections && connections.length > 0 && (
          <FormField label="From another system" hint="POST with an API key that can run it.">
            <CopyCommand command={curl} label="Copy the curl command" />
          </FormField>
        )}

        {error && (
          <p role="alert" className="text-xs text-status-error">
            {error}
          </p>
        )}
      </div>
    </ModalDialog>
  )
}
