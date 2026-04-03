import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ConnectionsList } from '../../components/connections/connections-list'
import { AddConnectionDialog } from '../../components/connections/add-connection-dialog'
import { EditConnectionDialog } from '../../components/connections/edit-connection-dialog'
import { RequireOrg } from '../../wrappers/require-org'

export const Route = createFileRoute('/_authed/connections')({
  head: () => ({ meta: [{ title: 'Connections | AwaitStep' }] }),
  component: ConnectionsPage,
})

function ConnectionsPage() {
  return (
    <RequireOrg>
      <ConnectionsContent />
    </RequireOrg>
  )
}

function ConnectionsContent() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<{
    id: string
    name: string
    accountId: string
  } | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Connections</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <div>
        <ConnectionsList onEdit={setEditTarget} />
      </div>

      {dialogOpen && <AddConnectionDialog onClose={() => setDialogOpen(false)} />}
      {editTarget && (
        <EditConnectionDialog connection={editTarget} onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}
