import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useRevokeWorkspaceKey, useRevokeWorkspaceKeyScope } from '../../data/dashboard/api-keys'
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

type Revoking = { key: ApiKey; kind: 'whole' | 'scope' }

/**
 * Workspace settings → API keys (`Access`): the keys that live only here, the
 * shared keys that reach several workspaces (each revocable just for this one),
 * and the project keys that work in every workspace.
 */
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
  const revokeScope = useRevokeWorkspaceKeyScope(slugs)
  const [revoking, setRevoking] = useState<Revoking | null>(null)
  const workspace = scope.workspace
  const canManage = scope.viewerCan.manageKeys.allowed

  // `reaching` holds two kinds: workspace-level bundle keys that include this
  // workspace (revocable here, for this workspace only) and project keys that
  // cover every workspace (managed at the project, read-only here).
  const shared = keys.reaching.filter((key) => key.level === 'workspace')
  const fromProject = keys.reaching.filter((key) => key.level === 'project')

  function startRevoke(key: ApiKey, kind: 'whole' | 'scope') {
    revoke.reset()
    revokeScope.reset()
    setRevoking({ key, kind })
  }

  function handleRevokeOpenChange(open: boolean) {
    if (!open) setRevoking(null)
  }

  function handleConfirm() {
    if (!revoking) return
    const mutation = revoking.kind === 'whole' ? revoke : revokeScope
    mutation.mutate(revoking.key.id, { onSuccess: () => setRevoking(null) })
  }

  const onRevoke = canManage ? (key: ApiKey) => startRevoke(key, 'whole') : undefined
  const onRevokeScope = canManage ? (key: ApiKey) => startRevoke(key, 'scope') : undefined
  const mutError = (revoke.error ?? revokeScope.error)?.message
  const revokeBody =
    revoking &&
    (mutError ??
      (revoking.kind === 'scope'
        ? `${workspace.name} stops using ${revoking.key.prefix}; the key keeps working for its other workspaces (last used: ${lastUsedLabel(revoking.key.lastUsedAt).toLowerCase()}). This can’t be undone.`
        : `Anything using ${revoking.key.prefix} stops working in ${workspace.name} immediately (last used: ${lastUsedLabel(revoking.key.lastUsedAt).toLowerCase()}). This can’t be undone.`))

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
      {mutError && !revoking && <Banner tone="warn">{mutError}</Banner>}
      <ScopedSection
        kind="own"
        scopeLabel={`Only in ${workspace.name}`}
        colour={workspace.colour}
        hint="Work in this workspace"
      >
        <KeyTable
          caption={`Keys for ${workspace.name} only`}
          keys={keys.own}
          onRevoke={onRevoke}
          empty={`No keys for ${workspace.name} alone yet.`}
          framed={false}
        />
      </ScopedSection>
      {shared.length > 0 && (
        <ScopedSection
          kind="own"
          scopeLabel="Shared across workspaces"
          hint="One key for a set of workspaces"
        >
          <KeyTable
            caption={`Keys shared with ${workspace.name}`}
            keys={shared}
            onRevoke={onRevokeScope}
            revokeLabel="Revoke access"
            framed={false}
          />
        </ScopedSection>
      )}
      <ScopedSection
        kind="inherited"
        scopeLabel={`From ${projectName}`}
        hint="Work in every workspace in the project"
        manage={{
          label: 'Manage in the project',
          href: projectPagePath(slugs, 'api-keys'),
        }}
      >
        <KeyTable
          caption="Inherited from the project"
          keys={fromProject}
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
          title={
            revoking.kind === 'scope'
              ? `Revoke access to ${revoking.key.name}?`
              : `Revoke ${revoking.key.name}?`
          }
          description={revokeBody}
          confirmLabel={revoking.kind === 'scope' ? 'Revoke access' : 'Revoke key'}
          cancelLabel="Keep key"
          variant="destructive"
          onConfirm={handleConfirm}
          loading={revoke.isPending || revokeScope.isPending}
        />
      )}
    </>
  )
}
