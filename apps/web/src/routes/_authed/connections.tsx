import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { HelpTooltip } from '../../components/ui/help-tooltip'
import { ConnectionsList } from '../../components/connections/connections-list'
import { AddConnectionDialog } from '../../components/connections/add-connection-dialog'
import { EditConnectionDialog } from '../../components/connections/edit-connection-dialog'
import { RequireOrg } from '../../wrappers/require-org'

export const Route = createFileRoute('/_authed/connections')({
  head: () => ({ meta: [{ title: 'Connections | AwaitStep' }] }),
  validateSearch: z.object({ new: z.boolean().optional() }).parse,
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
  const search = useSearch({ from: '/_authed/connections' })
  const [dialogOpen, setDialogOpen] = useState(search.new === true)
  const [editTarget, setEditTarget] = useState<{
    id: string
    name: string
    accountId: string
  } | null>(null)

  return (
    <div>
      <PageHeader
        title="Connections"
        description={
          <span className="inline-flex items-center gap-1">
            Deployment provider accounts
            <HelpTooltip
              title="Connections"
              description="Connections link your AwaitStep workspace to a deployment provider (e.g. Cloudflare). Each connection stores API credentials used to deploy and manage workflows on that provider."
            />
          </span>
        }
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Connections' }]}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        }
      />

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
