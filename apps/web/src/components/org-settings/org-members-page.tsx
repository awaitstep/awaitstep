import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useViewer } from '../../data/dashboard/session'
import {
  useCancelInvite,
  useInvitations,
  useOrgMembers,
  useResendInvite,
} from '../../data/dashboard/org-settings'
import { accessEditorPath } from '../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../lib/time'
import type { Invitation, OrgMember } from '../../types/dashboard/org-settings'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ListCard, ListRow } from '../ui/list-card'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody } from '../shell/page-intro'
import { OrgSettingsIntro } from './org-settings-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { ORG_ROLE_LABEL } from '../access/parts/access-draft'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { AccessEditorPanel } from './access-editor-panel'
import { invitationLabel, placeLabel } from './access-summary'
import { InvitePeopleDialog } from './invite-people-dialog'
import { useOrgScope } from './use-org-scope'

/** "All projects" for owners and admins; one line per place for members. */
function AccessLines({ member }: { member: OrgMember }) {
  if (member.role !== 'member')
    return <span className="text-xs text-foreground/90">All projects</span>
  if (member.places.length === 0) {
    return <span className="text-xs text-muted-foreground">Nothing yet</span>
  }
  return (
    <span className="flex flex-col gap-0.5 text-xs text-foreground/90">
      {member.places.map((place) => (
        <span key={`${place.project.id}:${place.workspace?.id ?? ''}`}>{placeLabel(place)}</span>
      ))}
    </span>
  )
}

export type MembersOverlay =
  { kind: 'access'; userId: string | null; project?: string } | { kind: 'invite' } | null

interface OrgMembersPageProps {
  org: string
  overlay: MembersOverlay
  onOverlayChange: (overlay: MembersOverlay) => void
}

/** `/{org}/settings/members` (`OrgMembers`): everyone, where they can work, and pending invites. */
export function OrgMembersPage({ org, overlay, onOverlayChange }: OrgMembersPageProps) {
  const scope = useOrgScope(org)
  const members = useOrgMembers(org)
  // Pending invites are listed to those who may act on them: an invite's id is its link.
  const canManage = scope?.viewerCan.manageSettings.allowed ?? false
  const invitations = useInvitations(org, { enabled: canManage })
  const viewer = useViewer()
  const resend = useResendInvite(org)
  const cancel = useCancelInvite(org)
  const [cancelling, setCancelling] = useState<Invitation | null>(null)

  if (!scope) return null
  const orgInfo = { slug: org, name: scope.org.name }
  const viewerId = viewer.data?.id

  function handleInvite() {
    onOverlayChange({ kind: 'invite' })
  }

  function handleCloseOverlay() {
    onOverlayChange(null)
  }

  function handleResend(invitation: Invitation) {
    resend.mutate(invitation.id)
  }

  function handleAskCancel(invitation: Invitation) {
    cancel.reset()
    setCancelling(invitation)
  }

  function handleCancelOpenChange(open: boolean) {
    if (!open) setCancelling(null)
  }

  function handleCancel() {
    if (!cancelling) return
    cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })
  }

  function handleRetry() {
    for (const query of [members, invitations]) {
      if (query.isError) void query.refetch()
    }
  }

  // Owners and admins reach everything through their org role; nothing to edit per project.
  function accessAction(member: OrgMember) {
    if (!canManage || member.person.id === viewerId) {
      return <span className="text-xs text-muted-foreground">—</span>
    }
    return (
      <ShellLink
        href={accessEditorPath(org, { userId: member.person.id })}
        className="text-xs font-medium text-status-success hover:underline"
      >
        Edit access
      </ShellLink>
    )
  }

  const columns: DataColumn<OrgMember>[] = [
    {
      id: 'person',
      header: 'Person',
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-3">
          <PersonAvatar person={m.person} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {m.person.name}
              {m.person.id === viewerId && ' (you)'}
            </span>
            <span className="truncate text-2xs text-muted-foreground">{m.person.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'role',
      header: 'Org role',
      width: '130px',
      cell: (m) => <Badge className="font-normal">{ORG_ROLE_LABEL[m.role]}</Badge>,
    },
    {
      id: 'access',
      header: 'Has access to',
      cell: (m) => <AccessLines member={m} />,
    },
    { id: 'actions', header: 'Actions', width: '120px', cell: accessAction },
  ]

  const failed = [members, invitations].find((query) => query.isError)
  let body
  if (failed) {
    body = (
      <WorkspaceLoadError
        what="members"
        error={failed.error}
        onRetry={handleRetry}
        retrying={members.isFetching || invitations.isFetching}
      />
    )
  } else if (!members.data || (canManage && !invitations.data)) {
    body = (
      <LoadingRegion label="Loading members">
        <ListCardSkeleton rows={5} trailing={3} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        <DataTable
          caption={`Members of ${scope.org.name}`}
          columns={columns}
          rows={members.data}
          getRowKey={(m) => m.person.id}
          minWidth="820px"
        />
        {canManage && invitations.data && invitations.data.length > 0 && (
          <OverviewCard title="Pending invitations">
            <ListCard framed={false} label="Pending invitations">
              {invitations.data.map((invitation) => (
                <ListRow
                  key={invitation.id}
                  title={invitation.email}
                  description={invitationLabel(invitation)}
                  trailing={
                    <>
                      <span className="text-2xs text-muted-foreground">
                        Sent {timeAgoOrDay(invitation.sentAt)}
                      </span>
                      {canManage && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleResend(invitation)}
                          >
                            Resend
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAskCancel(invitation)}
                          >
                            Cancel invite
                          </Button>
                        </>
                      )}
                    </>
                  }
                />
              ))}
            </ListCard>
          </OverviewCard>
        )}
      </>
    )
  }

  const cancelBody =
    cancelling &&
    (cancel.error?.message ??
      `The link in their email stops working. Their access is never granted. You can invite them again later.`)

  return (
    <>
      {canManage && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleInvite}>
            <UserPlus aria-hidden="true" />
            Invite people
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <OrgSettingsIntro org={orgInfo} section="members" />
        {body}
      </PageBody>
      {canManage && overlay?.kind === 'access' && (
        <AccessEditorPanel
          // A new person in the URL is a new editor, never the last one's draft.
          key={overlay.userId ?? `add:${overlay.project ?? ''}`}
          org={orgInfo}
          userId={overlay.userId}
          addToProject={overlay.project}
          viewerIsOwner={scope.viewerRole === 'owner'}
          onClose={handleCloseOverlay}
        />
      )}
      {canManage && overlay?.kind === 'invite' && (
        <InvitePeopleDialog org={orgInfo} onClose={handleCloseOverlay} />
      )}
      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={handleCancelOpenChange}
          title={`Cancel the invite to ${cancelling.email}?`}
          description={cancelBody}
          confirmLabel="Cancel invite"
          cancelLabel="Keep invite"
          onConfirm={handleCancel}
          loading={cancel.isPending}
        />
      )}
    </>
  )
}
