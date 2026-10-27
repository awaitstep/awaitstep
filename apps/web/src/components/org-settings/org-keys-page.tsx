import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useOrgKeys, useRevokeOrgKey } from '../../data/dashboard/api-keys'
import { useProjects } from '../../data/dashboard/projects'
import { orgSettingsPath, projectSettingsPath, withNewDialog } from '../../lib/dashboard-paths'
import type { ApiKey } from '../../types/dashboard/api-keys'
import { Banner } from '../ui/banner'
import { buttonVariants } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { recentProjects } from '../navigation/scope-memory'
import { TopBarContent } from '../navigation/top-bar-slot'
import { isExpired, lastUsedLabel } from '../keys/parts/key-format'
import { KeyLevelCards } from '../keys/parts/key-level-cards'
import { KeyTable } from '../keys/parts/key-table'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { useOrgScope } from './use-org-scope'
import { CreateKeyDialog } from '../keys/create-key-dialog'

interface OrgKeysPageProps {
  org: string
  /** `?new=key` opens Create an API key at the org level. */
  createOpen: boolean
  onCloseCreate: () => void
}

/** `/{org}/settings/api-keys` (`KeysPage` at org level): keys for automating the org itself. */
export function OrgKeysPage({ org, createOpen, onCloseCreate }: OrgKeysPageProps) {
  const scope = useOrgScope(org)
  const keys = useOrgKeys(org)
  const projects = useProjects(org)
  const revoke = useRevokeOrgKey(org)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)

  if (!scope) return null
  const canManage = scope.viewerCan.manageSettings.allowed
  const project =
    recentProjects(org).find((slug) => projects.data?.some((p) => p.slug === slug)) ??
    projects.data?.[0]?.slug

  function handleRevoke(key: ApiKey) {
    revoke.reset()
    setRevoking(key)
  }

  function handleCopyPrefix(key: ApiKey) {
    void navigator.clipboard?.writeText(key.prefix)
  }

  function handleRevokeOpenChange(open: boolean) {
    if (!open) setRevoking(null)
  }

  function handleConfirm() {
    if (!revoking) return
    revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })
  }

  function handleRetry() {
    void keys.refetch()
  }

  const onRevoke = canManage ? handleRevoke : undefined
  // Project and workspace keys can be made from here too, for the last project you opened.
  const projectRow = projects.data?.find((p) => p.slug === project)
  const projectRef = projectRow && { slug: projectRow.slug, name: projectRow.name }
  const links = project
    ? {
        project: {
          href: projectSettingsPath({ org, project }, 'api-keys'),
          label: 'Project keys',
        },
      }
    : {}
  const revokeBody =
    revoking &&
    (revoke.error?.message ??
      `Anything using ${revoking.prefix} stops working immediately (last used: ${lastUsedLabel(revoking.lastUsedAt).toLowerCase()}). This can’t be undone.`)

  const active = keys.data?.filter((key) => !isExpired(key.expiresAt)).length ?? 0
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
        <ListCardSkeleton rows={2} trailing={4} />
      </LoadingRegion>
    )
  } else {
    body = (
      <OverviewCard title="Org keys" caption={activeCaption}>
        <KeyTable
          caption={`Org keys for ${scope.org.name}`}
          keys={keys.data}
          onRevoke={onRevoke}
          onCopyPrefix={handleCopyPrefix}
          empty={`No org keys in ${scope.org.name} yet.`}
          framed={false}
        />
      </OverviewCard>
    )
  }

  return (
    <>
      {canManage && (
        <TopBarContent>
          <ShellLink
            href={withNewDialog(orgSettingsPath(org, 'api-keys'), 'key')}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New API key
          </ShellLink>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Organization API keys"
          description={`For automating ${scope.org.name} itself. To deploy or run workflows, create a project or workspace key instead.`}
        />
        <KeyLevelCards current="organization" links={links} />
        {revoke.error && !revoking && <Banner tone="warn">{revoke.error.message}</Banner>}
        {body}
      </PageBody>
      {createOpen && canManage && (
        <CreateKeyDialog
          org={{ slug: org, name: scope.org.name }}
          start="organization"
          project={projectRef}
          onClose={onCloseCreate}
        />
      )}
      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={handleRevokeOpenChange}
          title={`Revoke ${revoking.name}?`}
          description={revokeBody}
          confirmLabel="Revoke key"
          cancelLabel="Keep key"
          onConfirm={handleConfirm}
          loading={revoke.isPending}
        />
      )}
    </>
  )
}
