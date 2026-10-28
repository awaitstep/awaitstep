import { Navigate } from '@tanstack/react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { useMyInvites } from '../../data/dashboard/invites'
import { useOrgs, useSwitchOrg, useViewer } from '../../data/dashboard/session'
import { handleSignOut } from '../../lib/auth-client'
import { chooseOrgPath, invitePath, orgPath } from '../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../lib/time'
import type { PendingInvite } from '../../types/dashboard/invites'
import type { OrgSummary } from '../../types/dashboard/session'
import { AuthCard } from '../ui/auth-card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { LoadError } from '../ui/load-error'
import { ShellLink } from '../ui/shell-link'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { AuthLayout } from '../shell/auth-layout'
import { ORG_ROLE_LABEL } from '../access/parts/access-draft'
import { orgDetail } from '../navigation/switcher-details'

const FOOTER_LINKS = [{ label: 'Docs', href: 'https://docs.awaitstep.dev' }]

function describeOrg(org: OrgSummary): string {
  const opened = org.lastOpenedAt ? ` · last opened ${timeAgoOrDay(org.lastOpenedAt)}` : ''
  return `${orgDetail(org)}${opened}`
}

interface OrgRowProps {
  org: OrgSummary
  lastUsed: boolean
  onChoose: (slug: string) => void
}

function OrgRow({ org, lastUsed, onChoose }: OrgRowProps) {
  function handleClick() {
    onChoose(org.slug)
  }

  return (
    <li>
      <ShellLink
        href={orgPath(org.slug)}
        onClick={handleClick}
        className="flex items-center gap-3.5 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Tile tone="ok" size="lg">
          {org.initial}
        </Tile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{org.name}</span>
          <span className="truncate text-xs text-muted-foreground">{describeOrg(org)}</span>
        </span>
        {lastUsed && <Badge variant="success">Last used</Badge>}
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </ShellLink>
    </li>
  )
}

/** `ChooseOrg`'s invite row: "Globex · Lena Ortiz invited you · Member", Join. */
function InviteRow({ invite }: { invite: PendingInvite }) {
  return (
    <li>
      <ShellLink
        href={invitePath(invite.token)}
        className="flex items-center gap-3.5 rounded-xl border border-dashed border-border bg-background px-4 py-3.5 transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Tile tone="info" size="lg">
          {invite.org.initial}
        </Tile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{invite.org.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {invite.invitedBy} invited you · {ORG_ROLE_LABEL[invite.orgRole]}
          </span>
        </span>
        <Badge variant="info">Join</Badge>
      </ShellLink>
    </li>
  )
}

/**
 * The way into the dashboard after sign-in: straight to the org you opened
 * last, else the ChooseOrg board — your organizations, invites waiting for
 * you, Create an organization, Sign out. Open invites keep you here.
 */
export function ChooseOrgPage() {
  const viewer = useViewer()
  const orgs = useOrgs()
  const invites = useMyInvites()
  const switchOrg = useSwitchOrg()

  function handleRetry() {
    if (viewer.isError) void viewer.refetch()
    if (orgs.isError) void orgs.refetch()
  }

  function handleChoose(slug: string) {
    switchOrg.mutate(slug)
  }

  function handleSignOutClick() {
    void handleSignOut()
  }

  let card
  if (viewer.isError || orgs.isError) {
    card = (
      <LoadError
        title="We couldn’t load your organizations"
        detail="Nothing was changed. Try again in a moment."
        onRetry={handleRetry}
        retrying={viewer.isFetching || orgs.isFetching}
      />
    )
  } else if (!viewer.data || !orgs.data || invites.isPending) {
    card = (
      <LoadingRegion label="Loading your organizations">
        <Bone className="h-8 w-64" />
        <Bone className="h-16 w-full rounded-xl" />
        <Bone className="h-16 w-full rounded-xl" />
      </LoadingRegion>
    )
  } else {
    const last = viewer.data.lastOrgSlug
    // Invites are extra: if they fail to load, the orgs still show (and still open).
    const pending = invites.data ?? []
    // An invite waiting for you is worth a look before the usual org.
    if (pending.length === 0 && last && orgs.data.some((org) => org.slug === last)) {
      return <Navigate to={orgPath(last)} replace />
    }
    card = (
      <AuthCard
        width="lg"
        title="Choose an organization"
        lead={`Signed in as ${viewer.data.email}. Next time we’ll open the last one you used.`}
        actions={
          <>
            <Button asChild variant="outline">
              <ShellLink href={`${chooseOrgPath()}?new=org`}>
                <Plus aria-hidden="true" />
                Create an organization
              </ShellLink>
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" onClick={handleSignOutClick}>
              Sign out
            </Button>
          </>
        }
      >
        {orgs.data.length === 0 && pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren’t in any organization yet. Create one, or ask for an invite.
          </p>
        ) : (
          <ul aria-label="Your organizations" className="flex flex-col gap-2.5">
            {orgs.data.map((org) => (
              <OrgRow key={org.id} org={org} lastUsed={org.slug === last} onChoose={handleChoose} />
            ))}
            {pending.map((invite) => (
              <InviteRow key={invite.token} invite={invite} />
            ))}
          </ul>
        )}
      </AuthCard>
    )
  }

  return <AuthLayout footerLinks={FOOTER_LINKS}>{card}</AuthLayout>
}
