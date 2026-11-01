import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRevokeWorkspaceKey } from '../../data/dashboard/api-keys'
import {
  projectPagePath,
  workspaceSettingsPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import type { ApiKey, WorkspaceKeys } from '../../types/dashboard/api-keys'
import type { WorkspaceScope } from '../../types/dashboard/scope'
import { Banner } from '../ui/banner'
import { buttonVariants } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { ScopedSection } from '../ui/scoped-section'
import { ShellLink } from '../ui/shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { lastUsedLabel } from '../keys/parts/key-format'
import { KeyTable } from '../keys/parts/key-table'
import { CreateKeyDialog } from '../keys/create-key-dialog'

interface KeysTabProps {
  slugs: WorkspaceSlugs
  scope: WorkspaceScope
  orgName: string
  projectName: string
  keys: WorkspaceKeys
  /** `?tab=keys&new=key` opens Create an API key for this workspace. */
  createOpen: boolean
  onCloseCreate: () => void
}

/** Workspace settings → API keys (`Access`): its own keys, then the project keys that reach it. */
export function KeysTab({
  slugs,
  scope,
  orgName,
  projectName,
  keys,
  createOpen,
  onCloseCreate,
}: KeysTabProps) {
  const revoke = useRevokeWorkspaceKey(slugs)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const workspace = scope.workspace
  const canManage = scope.viewerCan.manageKeys.allowed

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

  const onRevoke = canManage ? handleRevoke : undefined
  const revokeBody =
    revoking &&
    (revoke.error?.message ??
      `Anything using ${revoking.prefix} stops reaching ${workspace.name} immediately (last used: ${lastUsedLabel(revoking.lastUsedAt).toLowerCase()}). This can’t be undone.`)

  return (
    <>
      {canManage && (
        <TopBarContent>
          <ShellLink
            href={workspaceSettingsPath(slugs, 'keys', 'key')}
            className={buttonVariants({ size: 'sm' })}
          >
            <Plus aria-hidden="true" />
            New workspace key
          </ShellLink>
        </TopBarContent>
      )}
      {revoke.error && !revoking && <Banner tone="warn">{revoke.error.message}</Banner>}
      <ScopedSection
        kind="own"
        scopeLabel={`Only in ${workspace.name}`}
        colour={workspace.colour}
        hint={`Reach ${workspace.name} and nothing else`}
      >
        <KeyTable
          caption={`Keys for ${workspace.name} only`}
          keys={keys.own}
          onRevoke={onRevoke}
          onCopyPrefix={handleCopyPrefix}
          empty={`No keys for ${workspace.name} alone yet.`}
          framed={false}
        />
      </ScopedSection>
      <ScopedSection
        kind="inherited"
        scopeLabel={`From ${projectName}`}
        hint="Project keys reach every workspace"
        manage={{
          label: 'Manage in the project',
          href: projectPagePath(slugs, 'api-keys'),
        }}
      >
        <KeyTable
          caption={`Project keys that reach ${workspace.name}`}
          keys={keys.inherited}
          inherited
          empty={`${projectName} has no project keys.`}
          framed={false}
        />
      </ScopedSection>
      {createOpen && canManage && (
        <CreateKeyDialog
          org={{ slug: slugs.org, name: orgName }}
          start="workspace"
          project={{ slug: slugs.project, name: projectName }}
          workspace={slugs.workspace}
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
