import { useId, useMemo, useState } from 'react'
import { useAddProjectPeople } from '../../data/dashboard/add-people'
import { useOrgPeople } from '../../data/dashboard/members'
import type { ProjectSlugs } from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import type { ProjectAccessChoice, ProjectMembers } from '../../types/dashboard/access'
import type { WorkspaceChip } from '../../types/dashboard/projects'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { SegmentedChoice } from '../ui/segmented-choice'
import { AddPeopleDialog } from '../access/parts/add-people-dialog'
import type { Pick } from '../access/parts/add-people-copy'
import { projectPool } from '../access/parts/people-pool'

type Scope = ProjectAccessChoice['scope']
type ProjectWideChoice = Extract<ProjectAccessChoice, { scope: 'project' }>['role']

const WORKSPACE_ROLES: { value: WorkspaceRole; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Workspace admin' },
]

const PROJECT_ROLES: { value: ProjectWideChoice; label: string }[] = [
  { value: 'admin', label: 'Project admin' },
  { value: 'member', label: 'Member' },
]

interface WorkspaceTogglesProps {
  workspaces: WorkspaceChip[]
  picked: string[]
  onToggle: (id: string) => void
}

function WorkspaceToggles({ workspaces, picked, onToggle }: WorkspaceTogglesProps) {
  return (
    <div role="group" aria-label="Workspaces" className="flex flex-wrap gap-1.5">
      {workspaces.map((workspace) => {
        const on = picked.includes(workspace.id)
        return (
          <button
            key={workspace.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(workspace.id)}
            className={cn(
              'h-[30px] rounded-full border px-3 text-xs font-medium transition-colors',
              on
                ? 'border-primary/60 bg-tone-ok text-status-success'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {workspace.name}
          </button>
        )
      })}
    </div>
  )
}

const SCOPES: { value: Scope; label: string; hint: (project: string) => string }[] = [
  {
    value: 'workspaces',
    label: 'Only these workspaces',
    hint: (project) => `They see nothing else in ${project}`,
  },
  {
    value: 'project',
    label: 'The whole project',
    hint: () => 'Every workspace, including ones made later',
  },
]

interface ScopeChoiceProps {
  value: Scope
  projectName: string
  onChange: (value: Scope) => void
}

/** The board's two rows: a dot, the choice and its line. Native radios, so arrow keys move it. */
function ScopeChoice({ value, projectName, onChange }: ScopeChoiceProps) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label="Access" className="flex flex-col gap-2">
      {SCOPES.map((scope) => {
        const checked = scope.value === value
        return (
          <label
            key={scope.value}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              checked
                ? 'border-primary/50 bg-primary/5'
                : 'border-border hover:border-foreground/20',
            )}
          >
            <input
              type="radio"
              name={name}
              value={scope.value}
              checked={checked}
              onChange={() => onChange(scope.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 size-4 shrink-0 rounded-full',
                checked ? 'border-[5px] border-primary' : 'border border-input',
              )}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-foreground">{scope.label}</span>
              <span className="text-xs text-muted-foreground">{scope.hint(projectName)}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** "Sales and IT", or "no workspace yet". */
function workspaceList(workspaces: WorkspaceChip[], ids: string[]): string {
  const names = workspaces.filter((w) => ids.includes(w.id)).map((w) => w.name)
  if (names.length === 0) return 'no workspace yet'
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

interface AddProjectPeopleDialogProps {
  slugs: ProjectSlugs
  orgName: string
  projectName: string
  workspaces: WorkspaceChip[]
  members: ProjectMembers
  /** Whether the viewer may invite new addresses from here (the project's admins may). */
  canInvite: boolean
  onClose: () => void
}

/**
 * `AddToProject` (21a): people from the org, or new addresses, get either
 * a role in the workspaces picked or the whole project.
 */
export function AddProjectPeopleDialog({
  slugs,
  orgName,
  projectName,
  workspaces,
  members,
  canInvite,
  onClose,
}: AddProjectPeopleDialogProps) {
  const orgPeople = useOrgPeople(slugs.org)
  const add = useAddProjectPeople(slugs.org, slugs.project)
  const [scope, setScope] = useState<Scope>('workspaces')
  const [picked, setPicked] = useState<string[]>(() => (workspaces[0] ? [workspaces[0].id] : []))
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole>('editor')
  // Admin rights are always a deliberate pick: each choice starts on its plainest role.
  const [projectRole, setProjectRole] = useState<ProjectWideChoice>('member')

  const pool = useMemo(
    () => (orgPeople.data ? projectPool({ orgPeople: orgPeople.data, members }) : []),
    [orgPeople.data, members],
  )

  function handleRetryPool() {
    void orgPeople.refetch()
  }

  let poolState: { status: 'loading' } | { status: 'error'; onRetry: () => void } | undefined
  if (orgPeople.isError) poolState = { status: 'error', onRetry: handleRetryPool }
  else if (!orgPeople.data) poolState = { status: 'loading' }

  const whole = scope === 'project'
  const roleLabel = whole
    ? PROJECT_ROLES.find((r) => r.value === projectRole)!.label
    : WORKSPACE_ROLES.find((r) => r.value === workspaceRole)!.label
  const where = whole ? `the whole of ${projectName}` : workspaceList(workspaces, picked)

  // Each choice starts again from its plainest role, never an admin one.
  function handleScope(next: Scope) {
    setScope(next)
    setProjectRole('member')
    setWorkspaceRole('editor')
  }

  function handleToggleWorkspace(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  function access(): ProjectAccessChoice {
    return whole
      ? { scope: 'project', role: projectRole }
      : { scope: 'workspaces', workspaceIds: picked, role: workspaceRole }
  }

  function handleSubmit(picks: Pick[]) {
    add.mutate({
      access: access(),
      userIds: picks.flatMap((p) => (p.kind === 'person' ? [p.entry.person.id] : [])),
      emails: picks.flatMap((p) => (p.kind === 'email' ? [p.email] : [])),
    })
  }

  return (
    <AddPeopleDialog
      title={`Add people to ${projectName}`}
      description={
        canInvite
          ? `Pick people from ${orgName}, or invite someone new by email.`
          : `Pick people from ${orgName}.`
      }
      searchLabel={canInvite ? `Search ${orgName}, or type an email address` : `Search ${orgName}`}
      pool={pool}
      canInvite={canInvite}
      poolState={poolState}
      ctx={{ kind: 'project', orgName, projectName, roleLabel, where }}
      access={
        <>
          <p className="mb-2.5 text-[11.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            What they get in {projectName}
          </p>
          <ScopeChoice value={scope} projectName={projectName} onChange={handleScope} />
          {!whole && (
            <div className="mt-2.5">
              <WorkspaceToggles
                workspaces={workspaces}
                picked={picked}
                onToggle={handleToggleWorkspace}
              />
            </div>
          )}
          <div className="mt-3">
            {whole ? (
              <SegmentedChoice
                label="Project role"
                options={PROJECT_ROLES}
                value={projectRole}
                onChange={setProjectRole}
              />
            ) : (
              <SegmentedChoice
                label="Role in each"
                options={WORKSPACE_ROLES}
                value={workspaceRole}
                onChange={setWorkspaceRole}
              />
            )}
          </div>
        </>
      }
      accessIncomplete={!whole && picked.length === 0}
      pending={add.isPending}
      outcomes={add.data}
      onSubmit={handleSubmit}
      onReset={add.reset}
      onClose={onClose}
    />
  )
}
