import { Navigate } from '@tanstack/react-router'
import { useOrgs, useViewer } from '../../data/dashboard/session'
import { orgPath } from '../../lib/dashboard-paths'
import { ListCard, ListRow } from '../ui/list-card'
import { LoadError } from '../ui/load-error'
import { Bone, LoadingRegion } from '../ui/skeletons'
import { Tile } from '../ui/tile'
import { PageBody, PageIntro } from '../shell/page-intro'

/**
 * The way into the new dashboard: straight to the org opened last, else a
 * list of orgs. A stand-in until P9 builds the ChooseOrg board.
 */
export function ChooseOrgEntry() {
  const viewer = useViewer()
  const orgs = useOrgs()

  function handleRetry() {
    if (viewer.isError) void viewer.refetch()
    if (orgs.isError) void orgs.refetch()
  }

  if (viewer.isError || orgs.isError) {
    return (
      <PageBody width="narrow">
        <LoadError
          title="We couldn’t load your organizations"
          detail="Nothing was changed. Try again in a moment."
          onRetry={handleRetry}
          retrying={viewer.isFetching || orgs.isFetching}
        />
      </PageBody>
    )
  }

  if (!viewer.data || !orgs.data) {
    return (
      <PageBody width="narrow">
        <LoadingRegion label="Loading your organizations">
          <Bone className="h-8 w-64" />
        </LoadingRegion>
      </PageBody>
    )
  }

  const last = viewer.data.lastOrgSlug
  if (last && orgs.data.some((org) => org.slug === last)) {
    return <Navigate to={orgPath(last)} replace />
  }

  return (
    <PageBody width="narrow">
      <PageIntro
        title="Choose an organization"
        description="Placeholder for ChooseOrg on the canvas, built in P9."
      />
      <ListCard label="Organizations" empty="You aren’t in any organization yet.">
        {orgs.data.map((org) => (
          <ListRow
            key={org.id}
            leading={<Tile>{org.initial}</Tile>}
            title={org.name}
            href={orgPath(org.slug)}
            description={`${org.projectCount} projects · ${org.memberCount} members`}
          />
        ))}
      </ListCard>
    </PageBody>
  )
}
