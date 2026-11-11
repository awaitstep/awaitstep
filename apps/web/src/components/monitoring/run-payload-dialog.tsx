import { useQuery } from '@tanstack/react-query'
import { useApi } from '../../contexts/api-client-context'
import { Button } from '../ui/button'
import { ModalDialog } from '../ui/modal-dialog'
import { useCopyStatus } from '../ui/use-copy-status'
import { Bone, LoadingRegion } from '../ui/skeletons'

interface RunPayloadDialogProps {
  workflowId: string
  runId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** "See the payload →": what the run was started with, read when it opens. */
export function RunPayloadDialog({ workflowId, runId, open, onOpenChange }: RunPayloadDialogProps) {
  const api = useApi()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workflow-run-params', workflowId, runId],
    queryFn: () => api.getWorkflowRunParams(workflowId, runId),
    enabled: open,
    // A run's payload never changes.
    staleTime: Infinity,
  })
  const text = data && data.params !== null ? JSON.stringify(data.params, null, 2) : undefined
  const { status, copy } = useCopyStatus(text)

  function handleCopy() {
    void copy()
  }

  function handleClose() {
    onOpenChange(false)
  }

  let body
  if (isLoading) {
    body = (
      <LoadingRegion label="Loading the payload">
        <Bone className="h-24 w-full rounded-lg" />
      </LoadingRegion>
    )
  } else if (isError) body = <p className="text-sm text-status-error">Couldn’t load the payload.</p>
  else if (text === undefined) {
    body = <p className="text-sm text-muted-foreground">It was started with no payload.</p>
  } else {
    body = (
      <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground/80">
        {text}
      </pre>
    )
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title="Payload"
      description="What this run was started with."
      actions={
        <>
          {text !== undefined && (
            <Button variant="outline" onClick={handleCopy}>
              {status === 'copied' ? 'Copied' : status === 'failed' ? 'Couldn’t copy' : 'Copy'}
            </Button>
          )}
          <Button onClick={handleClose}>Done</Button>
        </>
      }
    >
      {body}
    </ModalDialog>
  )
}
