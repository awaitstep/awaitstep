import { useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useRemoveWorkspaceMember, useSetWorkspaceRole } from '../../data/dashboard/members'
import { useViewer } from '../../data/dashboard/session'
import {
  orgPath,
  projectPath,
  projectPagePath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../lib/time'
import type { WorkspaceScope } from '../../types/dashboard/scope'
import type { WorkspacePerson, WorkspaceRole } from '../../types/dashboard/workspaces'
import { PersonAvatar } from '../ui/avatar-stack'
import { Badge } from '../ui/badge'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { ListCard, ListRow } from '../ui/list-card'
import { ScopedSection } from '../ui/scoped-section'
import { useGoTo } from '../navigation/router-shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { AddWorkspacePeopleDialog } from './add-people-dialog'
import { grantCounts } from '../../lib/workspace-roles'
import { WORKSPACE_ROLES, WORKSPACE_ROLE_LABEL, inheritedRoleLabel } from './workspace-roles'

interface MembersTabProps {
  slugs: WorkspaceSlugs
  scope: WorkspaceScope
  /** The project has a workspace other than this one: leaving still has somewhere to land. */
  hasOtherWorkspaces: boolean
  org: { slug: string; name: string }
  projectName: string
  people: WorkspacePerson[]
}

function activeLabel(at: string | null): string {
  return at ? `Active ${timeAgoOrDay(at)}` : 'Not active yet'
}

/** Workspace settings → Members (`Access`): who only this workspace has, and who comes from the project. */
export function MembersTab({
  slugs,
  scope,
  hasOtherWorkspaces,
  org,
  projectName,
  people,
}: MembersTabProps) {
  const viewer = useViewer()
  const goTo = useGoTo()
  const setRole = useSetWorkspaceRole(slugs)
  const remove = useRemoveWorkspaceMember(slugs)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<WorkspacePerson | null>(null)
  const workspace = scope.workspace
  const canManage = scope.viewerCan.manageMembers.allowed
  const own = people.filter((p) => !p.inherited)
  const inherited = people.filter((p) => p.inherited)
  const viewerId = viewer.data?.id

  function handleAdd() {
    setRole.reset()
    setAdding(true)
  }

  function handleCloseAdd() {
    setAdding(false)
  }

  function handleRole(person: WorkspacePerson, role: WorkspaceRole) {
    setRole.mutate({ userId: person.person.id, role })
  }

  function handleAskRemove(person: WorkspacePerson) {
    setRole.reset()
    remove.reset()
    setRemoving(person)
  }

  function handleRemoveOpenChange(open: boolean) {
    if (!open) setRemoving(null)
  }

  function handleRemove() {
    if (!removing) return
    // Removing your own only way in leaves nothing to show here: go to the
    // project if you can still open another workspace in it, else the org.
    const leaving = removing.person.id === viewerId && removing.projectRole === null
    const elsewhere = hasOtherWorkspaces
    const landing = elsewhere ? projectPath(slugs) : orgPath(slugs.org)
    remove.mutate(
      { userId: removing.person.id, leaving },
      {
        onSuccess: () => {
          setRemoving(null)
          if (leaving) goTo(landing)
        },
      },
    )
  }

  // What removing the grant leaves them: the project's role, or nothing here.
  function removeText(person: WorkspacePerson): string {
    const you = person.person.id === viewerId
    if (person.projectRole) {
      const keeps = `${inheritedRoleLabel({ role: person.projectRole, orgRole: null })} access through ${projectName}`
      return you ? `You keep ${keeps}.` : `They keep ${keeps}.`
    }
    return you
      ? `You lose access to ${workspace.name} right away.`
      : `They lose access to ${workspace.name} right away. Their work stays.`
  }

  function nameOf(person: WorkspacePerson): string {
    return person.person.id === viewerId ? `${person.person.name} (you)` : person.person.name
  }

  function rowMenu(person: WorkspacePerson) {
    if (!canManage) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Change role or remove ${person.person.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {WORKSPACE_ROLES.map((role) => {
            // Their current role, or one the project already gives them.
            const unavailable = role === person.role || !grantCounts(role, person.projectRole)
            return (
              <DropdownMenuItem
                key={role}
                disabled={unavailable}
                onSelect={() => handleRole(person, role)}
              >
                Make {WORKSPACE_ROLE_LABEL[role]}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleAskRemove(person)}>
            Remove from {workspace.name}…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const removeTitle = removing ? `Remove ${removing.person.name} from ${workspace.name}?` : ''
  const removeBody = remove.error?.message ?? (removing && removeText(removing))

  return (
    <>
      {canManage && (
        <TopBarContent>
          <Button type="button" size="sm" onClick={handleAdd}>
            <Plus aria-hidden="true" />
            Add people
          </Button>
        </TopBarContent>
      )}
      {setRole.error && <Banner tone="warn">{setRole.error.message}</Banner>}
      <ScopedSection
        kind="own"
        scopeLabel={`Only in ${workspace.name}`}
        colour={workspace.colour}
        hint="Access granted in this workspace"
      >
        <ListCard framed={false} label={`Only in ${workspace.name}`} empty="Nobody yet.">
          {own.map((person) => (
            <ListRow
              key={person.person.id}
              leading={<PersonAvatar person={person.person} />}
              title={nameOf(person)}
              description={person.person.email}
              trailing={
                <>
                  <Badge className="font-normal">{WORKSPACE_ROLE_LABEL[person.role]}</Badge>
                  {person.projectRole && (
                    <span className="text-2xs text-muted-foreground">
                      {inheritedRoleLabel({ role: person.projectRole, orgRole: null })} in every
                      workspace
                    </span>
                  )}
                  <span className="text-2xs text-muted-foreground">
                    {activeLabel(person.lastActiveAt)}
                  </span>
                  {rowMenu(person)}
                </>
              }
            />
          ))}
        </ListCard>
      </ScopedSection>
      <ScopedSection
        kind="inherited"
        scopeLabel={`From ${projectName}`}
        hint="Project members can open every workspace"
        manage={{
          label: 'Manage in the project',
          href: projectPagePath(slugs, 'members'),
        }}
      >
        <ListCard framed={false} label={`From ${projectName}`} empty="Nobody from the project.">
          {inherited.map((person) => (
            <ListRow
              key={person.person.id}
              leading={<PersonAvatar person={person.person} />}
              title={nameOf(person)}
              description={person.person.email}
              trailing={
                <>
                  <Badge className="font-normal">{inheritedRoleLabel(person)}</Badge>
                  <span className="text-2xs text-muted-foreground">
                    {activeLabel(person.lastActiveAt)}
                  </span>
                </>
              }
            />
          ))}
        </ListCard>
      </ScopedSection>
      {adding && (
        <AddWorkspacePeopleDialog
          slugs={slugs}
          org={org}
          projectName={projectName}
          workspaceName={workspace.name}
          people={people}
          onClose={handleCloseAdd}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={handleRemoveOpenChange}
          title={removeTitle}
          description={removeBody}
          confirmLabel="Remove"
          onConfirm={handleRemove}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
