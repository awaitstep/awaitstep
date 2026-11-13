import { useState } from 'react'
import { Store } from 'lucide-react'
import { useItemSlugs } from '../../contexts/editor-scope-context'
import { MarketplaceDialog } from '../resources/marketplace-dialog'
import { Button } from '../ui/button'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'

/**
 * Add → Custom node's way to the marketplace, for someone who may install
 * nodes: it opens the canvas's marketplace over the Add dialog, and closing it
 * refreshes the node list, so an install shows up here straight away.
 */
export function AddNodeMarketplace() {
  const slugs = useItemSlugs()
  const { org } = slugs
  // The editor's shell resolved this workspace's scope, which carries the
  // org rights: reading it costs no request. Org owners and admins install.
  const canInstall = useWorkspaceScope(slugs)?.orgManager === true
  const [open, setOpen] = useState(false)

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
  }

  if (!canInstall) return null
  return (
    <>
      <div className="border-t border-border px-3 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpen}
          className="w-full gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Store className="h-3.5 w-3.5" aria-hidden />
          Browse marketplace
        </Button>
      </div>
      {open && <MarketplaceDialog org={org} onClose={handleClose} />}
    </>
  )
}
