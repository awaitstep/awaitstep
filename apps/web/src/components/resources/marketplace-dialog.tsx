import { useEffect } from 'react'
import { Store } from 'lucide-react'
import { useNodeRegistry } from '../../contexts/node-registry-context'
import { useOrgNodes } from '../../data/dashboard/resources'
import { useOrgScope } from '../org-settings/use-org-scope'
import { Dialog, DialogContent } from '../ui/dialog'
import { OverlayBody, OverlayHeader } from '../ui/overlay-parts'
import { FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { LoadedQuery } from '../workspaces/loaded-query'
import { NodesTab } from './nodes-tab'
import { registryDetail } from './registry-error'

interface MarketplaceDialogProps {
  org: string
  onClose: () => void
}

/**
 * Resources › Nodes over the canvas (`?open=marketplace`). The palette's link
 * opens this instead of a new tab, so installing a node never leaves the graph.
 */
export function MarketplaceDialog({ org, onClose }: MarketplaceDialogProps) {
  const scope = useOrgScope(org)
  const nodes = useOrgNodes(org)
  const { refresh } = useNodeRegistry()
  const can = scope?.viewerCan.manageSettings

  // The palette is behind this dialog; refresh it on every close, including
  // Back, so an install is in the palette as soon as the canvas is visible.
  useEffect(() => () => refresh(), [refresh])

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent layout="sectioned" size="2xl" className="h-[90vh]">
        <OverlayHeader
          leading={
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="size-4" aria-hidden="true" />
            </span>
          }
          title="Marketplace"
          description="Nodes installed here are available in every project."
        />
        <OverlayBody>
          {scope && can ? (
            <LoadedQuery query={nodes} what="nodes" filters errorDetail={registryDetail}>
              {(data) => (
                <NodesTab
                  org={{ slug: org, name: scope.org.name }}
                  nodes={data}
                  canManage={can.allowed}
                  reason={can.reason}
                  asDialog
                />
              )}
            </LoadedQuery>
          ) : (
            <LoadingRegion label="Loading marketplace">
              <FilterSkeleton count={3} />
              <ListCardSkeleton rows={2} trailing={2} />
              <ListCardSkeleton rows={2} trailing={2} />
            </LoadingRegion>
          )}
        </OverlayBody>
      </DialogContent>
    </Dialog>
  )
}
