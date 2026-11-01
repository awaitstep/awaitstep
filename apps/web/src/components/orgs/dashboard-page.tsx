import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { useMyInvites } from '../../data/dashboard/invites'
import { useOrgs, useSwitchOrg, useViewer } from '../../data/dashboard/session'
import { handleSignOut } from '../../lib/auth-client'
import { accountPath, dashboardPath, withNewDialog } from '../../lib/dashboard-paths'
import type { OrgListing } from '../../types/dashboard/session'
import { ActionCard } from '../ui/action-card'
import { LoadError } from '../ui/load-error'
import { SearchField } from '../ui/search-field'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { firstName } from '../invites/invite-format'
import { CreateOrgDialog } from './create-org-dialog'
import { EntryFrame } from './parts/entry-frame'
import { NoOrgState } from './parts/no-org-state'
import { OrgCard } from './parts/org-card'
import { filterOrgs, orderOrgs } from './org-cards'
import { WaitingInvites } from './waiting-invites'
import { SectionHeader } from '../ui/section-header'

interface DashboardPageProps {
  /** `?new=org` opens Create an organization. */
  dialog: string | undefined
  onCloseDialog: () => void
}

function plural(count: number): string {
  return `${count} ${count === 1 ? 'organization' : 'organizations'}`
}

function YourOrgs({ orgs, lastUsed }: { orgs: OrgListing[]; lastUsed: string | null }) {
  const headingId = useId()
  const switchOrg = useSwitchOrg()
  const [query, setQuery] = useState('')
  const shown = filterOrgs(orgs, query)

  function handleOpen(slug: string) {
    switchOrg.mutate(slug)
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <SectionHeader
            id={headingId}
            title="Your organizations"
            direction="column"
            caption={`${plural(orgs.length)} · most recently opened first`}
          />
        </div>

        <SearchField
          label="Find an organization"
          placeholder="Find an organization"
          value={query}
          onChange={setQuery}
        />
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((org) => (
          <li key={org.id} className="grid">
            <OrgCard org={org} lastUsed={org.slug === lastUsed} onOpen={handleOpen} />
          </li>
        ))}
        <li className="grid">
          <ActionCard
            href={withNewDialog(dashboardPath(), 'org')}
            icon={Plus}
            tone="ok"
            title="Create an organization"
            description="For a new company or a side project. You’ll be its owner."
            variant="dashed"
          />
        </li>
      </ul>
      {query.trim() && shown.length === 0 && (
        <p role="status" className="text-xs text-muted-foreground">
          No organization matches “{query.trim()}”.
        </p>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading your organizations">
      <Bone className="h-8 w-72" />
      <Bone className="h-4 w-96 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Bone className="h-44 rounded-2xl" />
        <Bone className="h-44 rounded-2xl" />
        <Bone className="h-44 rounded-2xl" />
      </div>
    </LoadingRegion>
  )
}

/**
 * The org opened last that you're still in: the first of the ordered cards,
 * if this browser opened it at all. Not `viewer.lastOrgSlug`, which is the
 * last slug entered, known to exist or not (a 404, another account's org).
 */
function lastUsedOf(ordered: OrgListing[]): string | null {
  const first = ordered[0]
  return first?.lastOpenedAt ? first.slug : null
}

/**
 * `/dashboard` (17a/17b), where sign-in lands: the invites waiting for you,
 * every organization you're in — most recently opened first — and Create an
 * organization; with no organization, 17b's empty state.
 */
export function DashboardPage({ dialog, onCloseDialog }: DashboardPageProps) {
  const viewer = useViewer()
  const orgs = useOrgs()
  const invites = useMyInvites()

  function handleRetry() {
    if (viewer.isError) void viewer.refetch()
    if (orgs.isError) void orgs.refetch()
  }

  function handleSignOutClick() {
    void handleSignOut()
  }

  function handleDialogChange(open: boolean) {
    if (!open) onCloseDialog()
  }

  let account = null
  let body
  if (viewer.isError || orgs.isError) {
    body = (
      <LoadError
        title="We couldn’t load your organizations"
        detail="Nothing was changed. Your deployed workflows keep running."
        onRetry={handleRetry}
        retrying={viewer.isFetching || orgs.isFetching}
      />
    )
  } else if (!viewer.data || !orgs.data || invites.isPending) {
    body = <DashboardSkeleton />
  } else {
    const me = viewer.data
    const ordered = orderOrgs(orgs.data)
    const lastUsed = lastUsedOf(ordered)
    const hasOrgs = ordered.length > 0
    // Your account sits in an org's URL: the one opened last, else the first card (D-DB-5).
    const accountOrg = lastUsed ?? ordered[0]?.slug
    account = {
      name: me.name,
      email: me.email,
      image: me.image,
      href: accountOrg ? accountPath(accountOrg) : null,
    }
    body = (
      <>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-semibold text-foreground">
            {hasOrgs ? 'Welcome back' : 'Welcome to AwaitStep'}, {firstName(me.name)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {me.email}.
            {hasOrgs && ' Pick an organization, or carry on where you left off.'}
          </p>
        </div>
        {/* Invites are extra: if they fail to load, the organizations still show. */}
        <WaitingInvites invites={invites.data ?? []} />
        {hasOrgs ? (
          <YourOrgs orgs={ordered} lastUsed={lastUsed} />
        ) : (
          <NoOrgState email={me.email} />
        )}
      </>
    )
  }

  return (
    <EntryFrame account={account} onSignOut={handleSignOutClick}>
      {body}
      {/* Keyed on open: each opening starts with an empty name and no old error. */}
      <CreateOrgDialog
        key={dialog === 'org' ? 'open' : 'closed'}
        open={dialog === 'org'}
        onOpenChange={handleDialogChange}
      />
    </EntryFrame>
  )
}
