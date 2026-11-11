import { useQuery } from '@tanstack/react-query'
import { useQueries } from '../../contexts/api-client-context'
import { useDeployDialogStore } from '../../stores/deploy-dialog-store'
import { DeployBody } from '../workflow-detail/deploy-body'
import { Dialog, DialogContent } from '../ui/dialog'
import { OverlayBody, OverlayHeader } from '../ui/overlay-parts'
import { Bone } from '../ui/skeletons'

/** The Deploy page in a modal, shared by Canvas and Code. */
export function DeployDialogHost() {
  const workflowId = useDeployDialogStore((s) => s.workflowId)
  const open = useDeployDialogStore((s) => s.open)
  const closeDeploy = useDeployDialogStore((s) => s.closeDeploy)

  function handleOpenChange(next: boolean) {
    if (!next) closeDeploy()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && workflowId && <DeployDialogContent workflowId={workflowId} />}
    </Dialog>
  )
}

function DeployDialogContent({ workflowId }: { workflowId: string }) {
  const queries = useQueries()
  const full = useQuery(queries.workflows.full(workflowId))

  return (
    <DialogContent size="3xl" layout="sectioned">
      <OverlayHeader
        title="Deploy"
        description="Choose the account and settings, then deploy."
        divided
      />
      <OverlayBody>
        {full.data ? (
          <DeployBody
            workflow={full.data.workflow}
            live={full.data.liveDeployments}
            versionId={undefined}
            showHeader={false}
          />
        ) : full.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">
            {full.error.message}
          </p>
        ) : (
          <Bone className="h-80 w-full rounded-2xl" />
        )}
      </OverlayBody>
    </DialogContent>
  )
}
