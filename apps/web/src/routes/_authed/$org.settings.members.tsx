import { createFileRoute } from '@tanstack/react-router'
import { pageHead, type DashboardPage } from '../../components/navigation/dashboard-page'
import { OrgMembersPage, type MembersOverlay } from '../../components/org-settings/org-members-page'

const page: DashboardPage = { kind: 'org-settings', page: 'members' }

export const Route = createFileRoute('/_authed/$org/settings/members')({
  staticData: { dashboardPage: page },
  head: () => pageHead(page),
  component: OrgMembersRoute,
})

/**
 * `?access=<userId>` edits one person; `?access=add&project=<slug>` picks
 * someone to add to that project; `?new=invite` opens Invite people.
 */
function overlayFrom(search: { access?: string; project?: string; new?: string }): MembersOverlay {
  if (search.access === 'add') return { kind: 'access', userId: null, project: search.project }
  if (search.access) return { kind: 'access', userId: search.access }
  return search.new === 'invite' ? { kind: 'invite' } : null
}

function OrgMembersRoute() {
  const { org } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function handleOverlayChange(overlay: MembersOverlay) {
    const access = overlay?.kind === 'access' ? overlay : null
    void navigate({
      search: (prev) => ({
        mock: prev.mock,
        as: prev.as,
        access: access ? (access.userId ?? 'add') : undefined,
        project: access?.project,
        new: overlay?.kind === 'invite' ? 'invite' : undefined,
      }),
      replace: overlay === null,
    })
  }

  return (
    <OrgMembersPage org={org} overlay={overlayFrom(search)} onOverlayChange={handleOverlayChange} />
  )
}
