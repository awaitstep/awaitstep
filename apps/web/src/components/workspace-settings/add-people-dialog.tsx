import { useMemo, useState } from 'react'
import { useAddWorkspacePeople } from '../../data/dashboard/add-people'
import { useOrgPeople, useProjectMembers } from '../../data/dashboard/members'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { WorkspacePerson, WorkspaceRole } from '../../types/dashboard/workspaces'
import { SegmentedChoice } from '../ui/segmented-choice'
import { AddPeopleDialog } from '../access/parts/add-people-dialog'
import type { Pick } from '../access/parts/add-people-copy'
import { workspacePool } from '../access/parts/people-pool'

// The board's order and names: Editor first, the admin role spelled out.
const ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Workspace admin' },
]

interface AddWorkspacePeopleDialogProps {
  slugs: WorkspaceSlugs
  org: { slug: string; name: string }
  projectName: string
  workspaceName: string
  /** Everyone who can open the workspace now. */
  people: WorkspacePerson[]
  onClose: () => void
}

/**
 * `AddToWorkspace` (21b): people from the project or the wider org get a
 * role here; someone outside the project comes into it with this workspace
 * only, and a new address is invited to the org with it.
 */
export function AddWorkspacePeopleDialog({
  slugs,
  org,
  projectName,
  workspaceName,
  people,
  onClose,
}: AddWorkspacePeopleDialogProps) {
  const orgPeople = useOrgPeople(slugs.org)
  const members = useProjectMembers(slugs.org, slugs.project)
  const add = useAddWorkspacePeople(slugs)
  const [role, setRole] = useState<WorkspaceRole>('editor')

  const pool = useMemo(
    () =>
      orgPeople.data && members.data
        ? workspacePool({
            orgPeople: orgPeople.data,
            members: members.data,
            workspacePeople: people,
            orgName: org.name,
            projectName,
          })
        : [],
    [orgPeople.data, members.data, people, org.name, projectName],
  )
  const lists = [orgPeople, members]

  function handleRetryPool() {
    for (const list of lists) if (list.isError) void list.refetch()
  }

  let poolState: { status: 'loading' } | { status: 'error'; onRetry: () => void } | undefined
  if (lists.some((list) => list.isError)) poolState = { status: 'error', onRetry: handleRetryPool }
  else if (!orgPeople.data || !members.data) poolState = { status: 'loading' }

  const roleLabel = ROLE_OPTIONS.find((option) => option.value === role)!.label

  function handleSubmit(picks: Pick[]) {
    add.mutate({
      role,
      userIds: picks.flatMap((p) => (p.kind === 'person' ? [p.entry.person.id] : [])),
      emails: picks.flatMap((p) => (p.kind === 'email' ? [p.email] : [])),
    })
  }

  return (
    <AddPeopleDialog
      title={`Add people to ${workspaceName}`}
      description={`Add people from this project or the organization, or invite someone new.`}
      searchLabel={`Search ${projectName} and ${org.name}, or type an email`}
      pool={pool}
      canInvite
      poolState={poolState}
      ctx={{
        kind: 'workspace',
        orgName: org.name,
        projectName,
        roleLabel,
        where: workspaceName,
      }}
      access={
        <>
          <p className="text-2xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            Role in {workspaceName}
          </p>
          <div className="mt-3">
            <SegmentedChoice label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
          </div>
        </>
      }
      pending={add.isPending}
      outcomes={add.data}
      onSubmit={handleSubmit}
      onReset={add.reset}
      onClose={onClose}
    />
  )
}
