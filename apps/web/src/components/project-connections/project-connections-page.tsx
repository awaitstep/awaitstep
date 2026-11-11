import { useState } from 'react'
import { Info, KeyRound, Pencil, Plus } from 'lucide-react'
import {
  useAvailableConnections,
  useProjectConnections,
  useRemoveProjectConnection,
  useRenameProjectConnection,
  useReplaceProjectConnectionToken,
  useSetDefaultConnection,
  useSetWorkspaceConnection,
} from '../../data/dashboard/project-connections'
import { orgPath, type ProjectSlugs } from '../../lib/dashboard-paths'
import type {
  ProjectConnection,
  ProjectWorkspaceConnection,
} from '../../types/dashboard/project-connections'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { TextFieldDialog } from '../org-settings/text-field-dialog'
import { useOAuthStatus } from '../../data/dashboard/org-settings'
import { oauthStartUrl } from '../org-settings/oauth-start'
import { useProjectScope } from '../project-settings/use-project-scope'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { AddConnectionDialog, type AddTab } from './add-connection-dialog'
import { ChangeWorkspaceDialog } from './change-workspace-dialog'
import { AccountRow } from './parts/account-row'
import { ConnectionsEmpty } from './parts/connections-empty'
import { WorkspaceDeploys } from './parts/workspace-deploys'
import { accountsCaption, removeText } from './project-connections-copy'

type Overlay =
  | { kind: 'remove' | 'token' | 'rename'; connection: ProjectConnection }
  | { kind: 'workspace'; workspace: ProjectWorkspaceConnection }
  | null

interface ProjectConnectionsPageProps {
  slugs: ProjectSlugs
  /** `?new=connection` opens Add connection, on *In {org}* or (`&tab=new`) *Connect a new account*. */
  adding: AddTab | null
  onAddChange: (open: boolean, tab?: AddTab) => void
}

/**
 * `/{org}/{project}/connections` (`ProjectConnections`, `AttachConnection`,
 * `ProjectConnectionsEmpty`): the Cloudflare accounts the project deploys to,
 * its default, and where each workspace deploys. Read-only below project admin.
 */
export function ProjectConnectionsPage({
  slugs,
  adding,
  onAddChange,
}: ProjectConnectionsPageProps) {
  const scope = useProjectScope(slugs)
  const canManage = scope?.project.viewerCan.manageSettings.allowed === true
  const listed = useProjectConnections(slugs.org, slugs.project)
  const oauthStatus = useOAuthStatus(canManage)
  const empty = listed.data?.connections.length === 0
  const available = useAvailableConnections(slugs.org, slugs.project, empty)
  const setDefault = useSetDefaultConnection(slugs.org, slugs.project)
  const setWorkspace = useSetWorkspaceConnection(slugs.org, slugs.project)
  const replace = useReplaceProjectConnectionToken(slugs.org, slugs.project)
  const rename = useRenameProjectConnection(slugs.org, slugs.project)
  const remove = useRemoveProjectConnection(slugs.org, slugs.project)
  const [overlay, setOverlay] = useState<Overlay>(null)

  if (!scope) return null
  const orgName = scope.org.org.name
  const project = scope.project.project
  const oauthEnabled = oauthStatus.data?.enabled === true

  function handleAdd() {
    onAddChange(true, 'org')
  }

  function handleConnectNew() {
    onAddChange(true, 'new')
  }

  function handleTabChange(tab: AddTab) {
    onAddChange(true, tab)
  }

  function handleCloseAdd() {
    onAddChange(false)
  }

  function handleCloseOverlay() {
    setOverlay(null)
  }

  function open(next: NonNullable<Overlay>) {
    setWorkspace.reset()
    replace.reset()
    rename.reset()
    remove.reset()
    setOverlay(next)
  }

  function actionsFor(connection: ProjectConnection) {
    if (!canManage) return undefined
    return {
      onMakeDefault: () => setDefault.mutate(connection.id),
      onRename: () => open({ kind: 'rename', connection }),
      onReplaceToken: () => open({ kind: 'token', connection }),
      onReconnect: () =>
        window.location.assign(
          oauthStartUrl(slugs.org, { project: slugs.project, connectionId: connection.id }),
        ),
      onRemove: () => open({ kind: 'remove', connection }),
    }
  }

  function handleChangeWorkspace(workspace: ProjectWorkspaceConnection) {
    open({ kind: 'workspace', workspace })
  }

  function handleWorkspaceSubmit(connectionId: string | null) {
    if (overlay?.kind !== 'workspace') return
    setWorkspace.mutate(
      { workspaceId: overlay.workspace.workspaceId, connectionId },
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

  function handleRename(name: string) {
    if (overlay?.kind !== 'rename') return
    rename.mutate({ connectionId: overlay.connection.id, name }, { onSuccess: handleCloseOverlay })
  }

  function handleRemoveOpenChange(isOpen: boolean) {
    if (!isOpen) setOverlay(null)
  }

  function handleRemove() {
    if (overlay?.kind !== 'remove') return
    remove.mutate(overlay.connection.id, { onSuccess: handleCloseOverlay })
  }

  function handleRetry() {
    void listed.refetch()
  }

  const onUseOrgAccount = canManage ? handleAdd : undefined
  const onConnectNew = canManage ? handleConnectNew : undefined
  const onChangeWorkspace = canManage ? handleChangeWorkspace : undefined

  let body
  if (listed.isError) {
    body = (
      <WorkspaceLoadError
        what="connections"
        error={listed.error}
        onRetry={handleRetry}
        retrying={listed.isFetching}
      />
    )
  } else if (!listed.data) {
    body = (
      <LoadingRegion label="Loading connections">
        <ListCardSkeleton rows={2} trailing={2} />
      </LoadingRegion>
    )
  } else {
    const { connections, workspaces } = listed.data
    const availableCount = available.data
      ? available.data.filter((a) => a.state === 'available').length
      : null
    body = (
      <>
        {setDefault.error && <Banner tone="warn">{setDefault.error.message}</Banner>}
        <OverviewCard title="Connections" caption={accountsCaption(connections)}>
          {connections.length === 0 ? (
            <ConnectionsEmpty
              orgName={orgName}
              projectName={project.name}
              availableCount={availableCount}
              onUseOrgAccount={onUseOrgAccount}
              onConnectNew={onConnectNew}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {connections.map((connection) => (
                <AccountRow
                  key={connection.id}
                  connection={connection}
                  orgName={orgName}
                  actions={actionsFor(connection)}
                  busy={setDefault.isPending}
                />
              ))}
            </ul>
          )}
          {connections.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background/40 px-5 py-3.5 text-xs text-muted-foreground">
              <Info className="size-[15px] shrink-0" aria-hidden="true" />
              <span className="min-w-[280px] flex-1">
                Shared accounts are rotated in <b>{orgName}</b>; an account added here belongs to{' '}
                <b>{project.name}</b>.
              </span>
              <ShellLink
                href={orgPath(slugs.org, 'connections')}
                className="font-medium text-status-success hover:underline"
              >
                {orgName} connections →
              </ShellLink>
            </div>
          )}
        </OverviewCard>
        {connections.length !== 0 && (
          <WorkspaceDeploys workspaces={workspaces} onChange={onChangeWorkspace} />
        )}
      </>
    )
  }

  const removingOwned = overlay?.kind === 'remove' && overlay.connection.scope === 'project'
  const removeTitle =
    overlay?.kind !== 'remove'
      ? ''
      : removingOwned
        ? `Delete ${overlay.connection.name}?`
        : `Remove ${overlay.connection.name} from ${project.name}?`
  const removeBody =
    overlay?.kind === 'remove' &&
    (remove.error?.message ??
      removeText(
        overlay.connection,
        (listed.data?.workspaces ?? [])
          .filter((w) => w.source === 'override' && w.connectionId === overlay.connection.id)
          .map((w) => w.name),
        project.name,
      ))

  return (
    <>
      {canManage && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleAdd}>
            <Plus aria-hidden="true" />
            Add connection
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro title="Connections" description={`Providers ${project.name} can deploy to.`} />
        {body}
      </PageBody>
      {canManage && adding && (
        <AddConnectionDialog
          slugs={slugs}
          orgName={orgName}
          projectName={project.name}
          tab={adding}
          onTabChange={handleTabChange}
          onClose={handleCloseAdd}
        />
      )}
      {overlay?.kind === 'workspace' && listed.data && (
        <ChangeWorkspaceDialog
          workspace={overlay.workspace}
          connections={listed.data.connections}
          error={setWorkspace.error?.message}
          pending={setWorkspace.isPending}
          oauthHref={
            oauthEnabled
              ? oauthStartUrl(slugs.org, {
                  project: slugs.project,
                  workspaceId: overlay.workspace.workspaceId,
                })
              : undefined
          }
          onSubmit={handleWorkspaceSubmit}
          onClose={handleCloseOverlay}
        />
      )}
      {overlay?.kind === 'rename' && (
        <TextFieldDialog
          title={`Rename ${overlay.connection.name}`}
          description="Renames the account in AwaitStep only. Your Cloudflare account is unchanged."
          leading={
            <Tile tone="info" size="lg">
              <Pencil />
            </Tile>
          }
          label="Name"
          initial={overlay.connection.name}
          submitLabel="Rename"
          error={rename.error?.message}
          pending={rename.isPending}
          onSubmit={handleRename}
          onClose={handleCloseOverlay}
        />
      )}
      {overlay?.kind === 'token' && (
        <TextFieldDialog
          title={`Replace the token for ${overlay.connection.name}`}
          description="Paste a new token for this account. It’s checked with Cloudflare, then replaces the old one."
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
          title={removeTitle}
          description={removeBody}
          confirmLabel={removingOwned ? 'Delete account' : 'Remove'}
          variant="destructive"
          onConfirm={handleRemove}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
