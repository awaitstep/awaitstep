import { Plus } from 'lucide-react'
import { useProjectMembers } from '../../data/dashboard/members'
import { useViewer } from '../../data/dashboard/session'
import {
  accessEditorPath,
  projectMembersAddPath,
  type ProjectSlugs,
} from '../../lib/dashboard-paths'
import { AddProjectPeopleDialog } from './add-project-people-dialog'
import type { ProjectMembers, ProjectWideRole } from '../../types/dashboard/access'
import type { Person } from '../../types/dashboard/session'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { buttonVariants } from '../ui/button'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { ScopeChip } from '../ui/workspace-dot'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { useProjectScope } from './use-project-scope'

type WholeRow = ProjectMembers['wholeProject'][number]
type OnlyRow = ProjectMembers['workspacesOnly'][number]

const WIDE_ROLE_LABEL: Record<ProjectWideRole, string> = {
  owner: 'Owner · whole org',
  'org-admin': 'Admin · whole org',
  'project-admin': 'Project admin',
  'project-member': 'Project member',
}

const WORKSPACE_ROLE_LABEL: Record<WorkspaceRole, string> = {
  admin: 'Workspace admin',
  editor: 'Editor',
  viewer: 'Viewer',
}

interface MembersPageProps {
  slugs: ProjectSlugs
  /** Add people is open (`?access=add`): `AddToProject`, for the project's admins. */
  adding?: boolean
  onCloseAdd?: () => void
}

function PersonCell({ person, you }: { person: Person; you: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <PersonAvatar person={person} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-foreground">
          {person.name}
          {you && ' (you)'}
        </span>
        <span className="truncate text-2xs text-muted-foreground">{person.email}</span>
      </span>
    </span>
  )
}

/** `/{org}/{project}/members` (`ProjectMembers`): who opens every workspace, and who opens some. */
export function MembersPage({ slugs, adding = false, onCloseAdd }: MembersPageProps) {
  const scope = useProjectScope(slugs)
  const members = useProjectMembers(slugs.org, slugs.project)
  const viewer = useViewer()

  if (!scope) return null
  const project = scope.project.project
  // Edit access opens the org's access editor, which org owners and admins run; Add people is
  // the project's own (`AddToProject`), so its admins add and invite into it too.
  const canManage = scope.org.viewerCan.manageSettings.allowed
  const canAdd = scope.project.viewerCan.manageMembers.allowed
  const viewerId = viewer.data?.id

  function handleRetry() {
    void members.refetch()
  }

  function handleCloseAdd() {
    onCloseAdd?.()
  }

  // Org owners and admins get their access from the org, so it is edited there, not per project.
  function editLink(userId: string, fromOrg: boolean) {
    if (!canManage || fromOrg || userId === viewerId) {
      return <span className="text-xs text-muted-foreground">—</span>
    }
    return (
      <ShellLink
        href={accessEditorPath(slugs.org, { userId })}
        className="text-xs font-medium text-status-success hover:underline"
      >
        Edit access
      </ShellLink>
    )
  }

  const wholeColumns: DataColumn<WholeRow>[] = [
    {
      id: 'person',
      header: 'Person',
      cell: (row) => <PersonCell person={row.person} you={row.person.id === viewerId} />,
    },
    {
      id: 'role',
      header: 'Role',
      width: '180px',
      cell: (row) => <Badge className="font-normal">{WIDE_ROLE_LABEL[row.role]}</Badge>,
    },
    {
      id: 'workspaces',
      header: 'Workspaces',
      cell: () => <span className="text-xs text-muted-foreground">Every workspace</span>,
    },
    {
      id: 'action',
      header: '',
      width: '110px',
      cell: (row) => editLink(row.person.id, row.role === 'owner' || row.role === 'org-admin'),
    },
  ]

  const onlyColumns: DataColumn<OnlyRow>[] = [
    {
      id: 'person',
      header: 'Person',
      cell: (row) => <PersonCell person={row.person} you={row.person.id === viewerId} />,
    },
    {
      id: 'role',
      header: 'Project role',
      width: '180px',
      cell: () => <Badge className="font-normal">Member</Badge>,
    },
    {
      id: 'workspaces',
      header: 'Workspace and role',
      cell: (row) => (
        <span className="flex flex-wrap gap-x-3 gap-y-1.5">
          {row.workspaces.map(({ workspace, role }) => (
            <span key={workspace.id} className="flex items-center gap-1.5">
              <ScopeChip colour={workspace.colour}>{workspace.name}</ScopeChip>
              <span className="text-xs text-muted-foreground">{WORKSPACE_ROLE_LABEL[role]}</span>
            </span>
          ))}
        </span>
      ),
    },
    { id: 'action', header: '', width: '110px', cell: (row) => editLink(row.person.id, false) },
  ]

  let body
  if (members.isError) {
    body = (
      <WorkspaceLoadError
        what="members"
        error={members.error}
        onRetry={handleRetry}
        retrying={members.isFetching}
      />
    )
  } else if (!members.data) {
    body = (
      <LoadingRegion label="Loading members">
        <ListCardSkeleton rows={2} trailing={2} />
        <ListCardSkeleton rows={3} trailing={2} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        <OverviewCard title="Whole project" caption="Can open every workspace">
          <DataTable
            caption={`People who can open every workspace in ${project.name}`}
            columns={wholeColumns}
            rows={members.data.wholeProject}
            getRowKey={(row) => row.person.id}
            minWidth="820px"
            framed={false}
          />
        </OverviewCard>
        <OverviewCard title="Workspaces">
          <DataTable
            caption={`People who can open some workspaces in ${project.name}`}
            columns={onlyColumns}
            rows={members.data.workspacesOnly}
            getRowKey={(row) => row.person.id}
            empty="Nobody is limited to single workspaces."
            minWidth="820px"
            framed={false}
          />
        </OverviewCard>
      </>
    )
  }

  return (
    <>
      {canAdd && (
        <TopBarContent>
          <ShellLink href={projectMembersAddPath(slugs)} className={buttonVariants({ size: 'sm' })}>
            <Plus aria-hidden="true" />
            Add people
          </ShellLink>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="Members"
          description="People in this project and the workspaces they can open."
        />
        {body}
      </PageBody>
      {canAdd && adding && members.data && (
        <AddProjectPeopleDialog
          slugs={slugs}
          orgName={scope.org.org.name}
          projectName={project.name}
          workspaces={project.workspaces}
          members={members.data}
          canInvite={canAdd}
          onClose={handleCloseAdd}
        />
      )}
    </>
  )
}
