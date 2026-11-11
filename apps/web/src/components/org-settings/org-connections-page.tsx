import { useState } from 'react'
import { KeyRound, Lock, Pencil, Plus } from 'lucide-react'
import {
  useConnections,
  useRemoveConnection,
  useReplaceToken,
  useUpdateConnection,
} from '../../data/dashboard/org-settings'
import { useProjects } from '../../data/dashboard/projects'
import type { Connection } from '../../types/dashboard/org-settings'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { AddAccountDialog } from './add-account-dialog'
import { oauthStartUrl } from './oauth-start'
import { ConnectionCard } from './parts/connection-card'
import { TextFieldDialog } from './text-field-dialog'
import { useOrgScope } from './use-org-scope'

type Overlay = { kind: 'rename' | 'token' | 'remove'; connection: Connection } | null

interface OrgConnectionsPageProps {
  org: string
  /** `?new=connection` opens Add account. */
  connectOpen: boolean
  onConnectChange: (open: boolean) => void
}

/** `/{org}/connections` (`OrgConnections`, its own rail item): Cloudflare accounts and who may deploy with each. */
export function OrgConnectionsPage({ org, connectOpen, onConnectChange }: OrgConnectionsPageProps) {
  const scope = useOrgScope(org)
  const canManage = scope?.viewerCan.manageSettings.allowed === true
  const connections = useConnections(org)
  // The picker's list is fetched when a card's project picker opens.
  const [projectsOpen, setProjectsOpen] = useState(false)
  const projects = useProjects(org, { enabled: projectsOpen })
  const update = useUpdateConnection(org)
  const replace = useReplaceToken(org)
  const remove = useRemoveConnection(org)
  const [overlay, setOverlay] = useState<Overlay>(null)

  if (!scope) return null
  const orgInfo = { slug: org, name: scope.org.name }

  function handleConnect() {
    onConnectChange(true)
  }

  function handleReconnect(connection: Connection) {
    window.location.assign(oauthStartUrl(org, { connectionId: connection.id }))
  }

  function handleCloseConnect() {
    onConnectChange(false)
  }

  function handleCloseOverlay() {
    setOverlay(null)
  }

  function open(kind: 'rename' | 'token' | 'remove', connection: Connection) {
    update.reset()
    replace.reset()
    remove.reset()
    setOverlay({ kind, connection })
  }

  function projectIds(connection: Connection): string[] {
    return connection.projects === 'all' ? [] : connection.projects.map((p) => p.id)
  }

  // A chip change sends the whole list read from the cache: a second one before
  // the first lands would send a list without it, so it waits.
  function changeProjects(connection: Connection, projects: string[]) {
    if (update.isPending) return
    update.mutate({ connectionId: connection.id, update: { projects } })
  }

  function actionsFor(connection: Connection) {
    if (!canManage) return undefined
    return {
      onAddProject: (projectId: string) =>
        changeProjects(connection, [...projectIds(connection), projectId]),
      onRemoveProject: (projectId: string) =>
        changeProjects(
          connection,
          projectIds(connection).filter((id) => id !== projectId),
        ),
      onReplaceToken: () => open('token', connection),
      onReconnect: () => handleReconnect(connection),
      onRename: () => open('rename', connection),
      onRemove: () => open('remove', connection),
    }
  }

  function addableFor(connection: Connection) {
    const taken = new Set(projectIds(connection))
    return (projects.data ?? [])
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ id: p.id, name: p.name }))
  }

  function handleRename(name: string) {
    if (overlay?.kind !== 'rename') return
    update.mutate(
      { connectionId: overlay.connection.id, update: { name } },
      { onSuccess: handleCloseOverlay },
    )
  }

  function handleReplace(token: string) {
    if (overlay?.kind !== 'token') return
    replace.mutate(
      { connectionId: overlay.connection.id, token },
      { onSuccess: handleCloseOverlay },
    )
  }

  function handleRemoveOpenChange(isOpen: boolean) {
    if (!isOpen) setOverlay(null)
  }

  function handleRemove() {
    if (overlay?.kind !== 'remove') return
    remove.mutate(overlay.connection.id, { onSuccess: handleCloseOverlay })
  }

  function handleRetry() {
    void connections.refetch()
  }

  let body
  if (connections.isError) {
    body = (
      <WorkspaceLoadError
        what="connections"
        error={connections.error}
        onRetry={handleRetry}
        retrying={connections.isFetching}
      />
    )
  } else if (!connections.data) {
    body = (
      <LoadingRegion label="Loading connections">
        <ListCardSkeleton rows={2} trailing={2} />
      </LoadingRegion>
    )
  } else if (connections.data.length === 0) {
    body = (
      <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
        No Cloudflare account yet. Connect one to deploy workflows; you can build first.
      </p>
    )
  } else {
    body = connections.data.map((connection) => (
      <ConnectionCard
        key={connection.id}
        connection={connection}
        addable={addableFor(connection)}
        onAddingChange={setProjectsOpen}
        actions={actionsFor(connection)}
      />
    ))
  }

  const removeBody =
    overlay?.kind === 'remove' &&
    (remove.error?.message ??
      `Projects using ${overlay.connection.name} can’t deploy until they get another account. Deployed workers keep running.`)

  return (
    <>
      {canManage && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleConnect}>
            <Plus aria-hidden="true" />
            Add account
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro title="Connections" description="Providers you deploy to, eg. Cloudflare" />
        {body}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          Credentials stay encrypted and are never shown again after you save them.
        </p>
      </PageBody>
      {canManage && connectOpen && <AddAccountDialog org={orgInfo} onClose={handleCloseConnect} />}
      {overlay?.kind === 'rename' && (
        <TextFieldDialog
          title={`Rename ${overlay.connection.name}`}
          description="Renames the connection in AwaitStep only. Your Cloudflare account is unchanged."
          leading={
            <Tile tone="info" size="lg">
              <Pencil />
            </Tile>
          }
          label="Name"
          initial={overlay.connection.name}
          submitLabel="Rename"
          error={update.error?.message}
          pending={update.isPending}
          onSubmit={handleRename}
          onClose={handleCloseOverlay}
        />
      )}
      {overlay?.kind === 'token' && (
        <TextFieldDialog
          title={`Replace the token for ${overlay.connection.name}`}
          description="Paste a new token for this account. It replaces the old one."
          leading={
            <Tile tone="warn" size="lg">
              <KeyRound />
            </Tile>
          }
          label="API token"
          hint="Encrypted when saved. You won’t see it again."
          submitLabel="Replace token"
          error={replace.error?.message}
          pending={replace.isPending}
          monospace
          type="password"
          onSubmit={handleReplace}
          onClose={handleCloseOverlay}
        />
      )}
      {overlay?.kind === 'remove' && (
        <ConfirmDialog
          open
          onOpenChange={handleRemoveOpenChange}
          title={`Remove ${overlay.connection.name}?`}
          description={removeBody}
          confirmLabel="Remove connection"
          onConfirm={handleRemove}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
