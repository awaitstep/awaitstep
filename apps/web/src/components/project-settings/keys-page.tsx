import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useProjectKeys, useRevokeProjectKey } from '../../data/dashboard/api-keys'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import {
  orgSettingsPath,
  projectSettingsPath,
  withNewDialog,
  workspaceSettingsPath,
  type ProjectSlugs,
} from '../../lib/dashboard-paths'
import type { ApiKey } from '../../types/dashboard/api-keys'
import { Banner } from '../ui/banner'
import { buttonVariants } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { ScopeChip } from '../ui/workspace-dot'
import { PageBody, PageIntro } from '../shell/page-intro'
import { pickWorkspace } from '../navigation/land-in-workspace'
import { recentWorkspaces } from '../navigation/scope-memory'
import { TopBarContent } from '../navigation/top-bar-slot'
import { isExpired, lastUsedLabel } from '../keys/parts/key-format'
import { KeyLevelCards } from '../keys/parts/key-level-cards'
import { KeyTable } from '../keys/parts/key-table'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { useProjectScope } from './use-project-scope'
import { CreateKeyDialog } from '../keys/create-key-dialog'

interface KeysPageProps {
  slugs: ProjectSlugs
  /** `?new=key` opens Create an API key. */
  createOpen: boolean
  onCloseCreate: () => void
}

function revokeText(key: ApiKey): string {
  const used = lastUsedLabel(key.lastUsedAt).toLowerCase()
  return `Anything using ${key.prefix} stops working immediately (last used: ${used}). Keys it minted stop too. This can’t be undone.`
}

/**
 * `/{org}/{project}/settings/api-keys` (`KeysPage`, project level). New API
 * key opens P6's dialog through `?new=key` (D-P3-4); revoking works here.
 */
export function KeysPage({ slugs, createOpen, onCloseCreate }: KeysPageProps) {
  const scope = useProjectScope(slugs)
  const keys = useProjectKeys(slugs.org, slugs.project)
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const revoke = useRevokeProjectKey(slugs.org, slugs.project)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  if (!scope) return null
  const project = scope.project.project
  const canManage = scope.project.viewerCan.manageKeys.allowed
  const lastWorkspace = pickWorkspace(
    (workspaces.data ?? []).map((w) => w.slug),
    recentWorkspaces(slugs.org, slugs.project),
  )

  function handleRevoke(key: ApiKey) {
    revoke.reset()
    setRevoking(key)
  }

  function handleCopyPrefix(key: ApiKey) {
    void navigator.clipboard?.writeText(key.prefix)
  }

  function handleConfirmRevoke() {
    if (!revoking) return
    revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })
  }

  function handleRevokeOpenChange(open: boolean) {
    if (!open) setRevoking(null)
  }

  function handleRetry() {
    void keys.refetch()
  }

  const onRevoke = canManage ? handleRevoke : undefined
  // A failed revoke stays in the dialog, in place of the warning.
  const revokeDescription = revoking && (revoke.error?.message ?? revokeText(revoking))
  const links = {
    organization: { href: orgSettingsPath(slugs.org, 'api-keys'), label: 'Org keys' },
    ...(lastWorkspace && {
      workspace: {
        href: workspaceSettingsPath({ ...slugs, workspace: lastWorkspace }, 'keys'),
        label: 'In Workspace settings',
      },
    }),
  }

  const active = keys.data?.keys.filter((key) => !isExpired(key.expiresAt)).length ?? 0
  const activeCaption = `${active} active`

  let body
  if (keys.isError) {
    body = (
      <WorkspaceLoadError
        what="API keys"
        error={keys.error}
        onRetry={handleRetry}
        retrying={keys.isFetching}
      />
    )
  } else if (!keys.data) {
    body = (
      <LoadingRegion label="Loading API keys">
        <ListCardSkeleton rows={3} trailing={4} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        {revoke.error && !revoking && <Banner tone="warn">{revoke.error.message}</Banner>}
        <OverviewCard title="Project keys" caption={activeCaption}>
          <KeyTable
            caption={`Project keys for ${project.name}`}
            keys={keys.data.keys}
            onRevoke={onRevoke}
            onCopyPrefix={handleCopyPrefix}
            empty={`No project keys in ${project.name} yet.`}
            framed={false}
          />
        </OverviewCard>
        {keys.data.workspaceKeys.length > 0 && (
          <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-dashed border-border px-5 py-4">
            <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">Workspace keys</h2>
              <span className="text-xs text-muted-foreground">
                Keys that reach one workspace only live in that workspace’s settings
              </span>
            </span>
            <ul className="flex flex-wrap gap-2">
              {keys.data.workspaceKeys.map(({ workspace, count }) => (
                <li key={workspace.id}>
                  <ShellLink
                    href={workspaceSettingsPath({ ...slugs, workspace: workspace.slug }, 'keys')}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ScopeChip colour={workspace.colour}>
                      {workspace.name} · {count}
                    </ScopeChip>
                  </ShellLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    )
  }

  return (
    <>
      {canManage && (
        <TopBarContent>
          <ShellLink
            href={withNewDialog(projectSettingsPath(slugs, 'api-keys'), 'key')}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New API key
          </ShellLink>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Project API keys"
          description={`Keys that reach every workspace in ${project.name}. Give each key only the permissions it needs.`}
        />
        <KeyLevelCards current="project" links={links} />
        {body}
      </PageBody>
      {createOpen && canManage && (
        <CreateKeyDialog
          org={{ slug: slugs.org, name: scope.org.org.name }}
          start="project"
          project={{ slug: slugs.project, name: project.name }}
          onClose={onCloseCreate}
        />
      )}
      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={handleRevokeOpenChange}
          title={`Revoke ${revoking.name}?`}
          description={revokeDescription}
          confirmLabel="Revoke key"
          cancelLabel="Keep key"
          variant="destructive"
          onConfirm={handleConfirmRevoke}
          loading={revoke.isPending}
        />
      )}
    </>
  )
}
