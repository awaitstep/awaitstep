import { useState } from 'react'
import { Cloud, MoreHorizontal, Plus, X } from 'lucide-react'
import { plural } from '../../../lib/plural'
import { timeAgoOrDay } from '../../../lib/time'
import type { Connection } from '../../../types/dashboard/org-settings'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { Tile } from '../../ui/tile'
import { ScopeSwitcher } from '../../shell/scope-switcher'
import { expiryLabel } from '../../keys/parts/key-format'

interface ConnectionCardProps {
  connection: Connection
  /** Projects that could be added to its list. */
  addable: { id: string; name: string }[]
  /** Without it the card is read-only. */
  actions?: {
    onAddProject: (projectId: string) => void
    onRemoveProject: (projectId: string) => void
    onReplaceToken: () => void
    onRename: () => void
    onRemove: () => void
  }
  now?: Date
}

function tokenStatus(connection: Connection, now: Date) {
  if (!connection.tokenExpiresAt) return { text: 'Token valid', variant: 'success' as const }
  const expiry = expiryLabel(connection.tokenExpiresAt, now)
  if (expiry.text === 'Expired') return { text: 'Token expired', variant: 'error' as const }
  const when = expiry.text.replace(/^In /, 'in ').replace(/^Today$/, 'today')
  return { text: `Token expires ${when}`, variant: 'warning' as const }
}

/** One Cloudflare account on org Connections (`OrgConnections`). */
export function ConnectionCard({
  connection,
  addable,
  actions,
  now = new Date(),
}: ConnectionCardProps) {
  const [adding, setAdding] = useState(false)
  const status = tokenStatus(connection, now)
  const needsToken = status.variant !== 'success'
  const deployments = connection.deployments
  const deploymentsLine =
    deployments.count === 0 || !deployments.lastAt
      ? 'No deployments yet'
      : `${plural(deployments.count, 'deployment')} · last ${timeAgoOrDay(deployments.lastAt, now)}`

  function handleAdd(projectId: string) {
    setAdding(false)
    actions?.onAddProject(projectId)
  }

  return (
    <section
      aria-label={connection.name}
      className="settings-width flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-start gap-3.5">
        <Tile tone="warn" size="md">
          <Cloud />
        </Tile>
        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{connection.name}</span>
          <span className="text-2xs text-muted-foreground">
            Cloudflare account ••••{connection.accountSuffix} · added by {connection.addedBy.name}
          </span>
        </span>
        <Badge variant={status.variant} className="font-normal">
          {status.text}
        </Badge>
        {actions && needsToken && (
          <Button type="button" variant="outline" size="sm" onClick={actions.onReplaceToken}>
            Replace token
          </Button>
        )}
        {actions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`More actions for ${connection.name}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={actions.onRename}>Rename…</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onReplaceToken}>Replace token…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={actions.onRemove}>Remove connection…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          Available to
        </span>
        {connection.projects === 'all' ? (
          <Badge className="font-normal">All projects, including new ones</Badge>
        ) : (
          connection.projects.map((project) => (
            <Badge key={project.id} className="gap-1 font-normal">
              {project.name}
              {actions && (
                <button
                  type="button"
                  aria-label={`Remove ${project.name} from ${connection.name}`}
                  onClick={() => actions.onRemoveProject(project.id)}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </Badge>
          ))
        )}
        {actions && connection.projects !== 'all' && addable.length > 0 && (
          <ScopeSwitcher
            open={adding}
            onOpenChange={setAdding}
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3" aria-hidden="true" />
                Project
              </button>
            }
            label={`Add a project to ${connection.name}`}
            searchPlaceholder="Find a project"
            groups={[
              {
                label: 'Projects',
                items: addable.map((p) => ({
                  id: p.id,
                  name: p.name,
                  tile: { initial: p.name.charAt(0) },
                })),
              },
            ]}
            currentLabel="Added"
            onSelect={handleAdd}
          />
        )}
      </div>
      <span className="text-2xs text-muted-foreground">{deploymentsLine}</span>
    </section>
  )
}
