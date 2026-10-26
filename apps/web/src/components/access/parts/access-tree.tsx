import { useId } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge } from '../../ui/badge'
import { Select } from '../../ui/select'
import { Tile } from '../../ui/tile'
import { WorkspaceDot } from '../../ui/workspace-dot'
import type { AccessDraft, AccessProject } from '../../../types/dashboard/access'
import type { ProjectRole, WorkspaceChip } from '../../../types/dashboard/projects'
import type { OrgRole } from '../../../types/dashboard/session'
import type { WorkspaceRole } from '../../../types/dashboard/workspaces'
import {
  ORG_ROLE_LABEL,
  PROJECT_ROLE_LABEL,
  WORKSPACE_ROLE_LABEL,
  coveringRole,
  describeAccess,
  isOrgWide,
  orgRoleHint,
} from './access-draft'

// Radix Select can't hold an empty value, so "no role" travels as 'none'.
const NO_ROLE = 'none'

const ORG_ROLE_OPTIONS = (['member', 'admin', 'owner'] as const).map((role) => ({
  value: role,
  label: ORG_ROLE_LABEL[role],
}))

const PROJECT_ROLE_OPTIONS = [
  { value: NO_ROLE, label: 'No project role' },
  ...(['member', 'admin'] as const).map((role) => ({
    value: role,
    label: PROJECT_ROLE_LABEL[role],
  })),
]

const WORKSPACE_ROLE_OPTIONS = [
  { value: NO_ROLE, label: 'No access' },
  ...(['viewer', 'editor', 'admin'] as const).map((role) => ({
    value: role,
    label: WORKSPACE_ROLE_LABEL[role],
  })),
]

function fromOption<Role extends string>(value: string): Role | null {
  return value === NO_ROLE ? null : (value as Role)
}

interface AccessTreeProps {
  /** "Daniel", for "Daniel can work in". */
  personFirstName: string
  orgName: string
  projects: AccessProject[]
  value: AccessDraft
  onChange: (next: AccessDraft) => void
}

/**
 * One person's access, from the Edit access panel: org role, then (for org
 * members) a role per project or per workspace, and where that lets them work.
 */
export function AccessTree({
  personFirstName,
  orgName,
  projects,
  value,
  onChange,
}: AccessTreeProps) {
  const orgLabelId = useId()
  const orgHintId = useId()
  const projectsHeadingId = useId()
  const orgWide = isOrgWide(value)
  const places = describeAccess(value, projects, orgName)

  function handleOrgRole(role: string) {
    onChange({ ...value, orgRole: role as OrgRole })
  }

  function handleProjectRole(projectId: string, role: ProjectRole | null) {
    onChange({ ...value, projects: { ...value.projects, [projectId]: role } })
  }

  function handleWorkspaceRole(workspaceId: string, role: WorkspaceRole | null) {
    onChange({ ...value, workspaces: { ...value.workspaces, [workspaceId]: role } })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background p-4">
        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span id={orgLabelId} className="text-sm font-semibold text-foreground">
            Role in {orgName}
          </span>
          <span id={orgHintId} className="text-2xs text-muted-foreground">
            {orgRoleHint(value.orgRole, orgName)}
          </span>
        </span>
        <Select
          value={value.orgRole}
          onValueChange={handleOrgRole}
          options={ORG_ROLE_OPTIONS}
          aria-labelledby={orgLabelId}
          aria-describedby={orgHintId}
          className="h-9 w-36"
        />
      </div>

      {orgWide ? (
        <p className="flex items-center gap-2.5 rounded-xl border border-dashed border-inherited-border px-4 py-3.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          {value.orgRole === 'owner' ? 'Owners' : 'Admins'} open every project and workspace, so
          per-project roles are not needed.
        </p>
      ) : (
        <section aria-labelledby={projectsHeadingId} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 id={projectsHeadingId} className="text-sm font-semibold text-foreground">
              Projects and workspaces
            </h3>
            <p className="text-2xs text-muted-foreground">
              A project role opens every workspace in it. Otherwise, pick workspaces one by one.
            </p>
          </div>
          {projects.map((project) => (
            <ProjectBlock
              key={project.id}
              project={project}
              value={value}
              onProjectRole={handleProjectRole}
              onWorkspaceRole={handleWorkspaceRole}
            />
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {personFirstName} can work in
        </span>
        <ul aria-label={`${personFirstName} can work in`} className="flex flex-wrap gap-1.5">
          {places.map((place) => (
            <li key={place}>
              <Badge>{place}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

interface ProjectBlockProps {
  project: AccessProject
  value: AccessDraft
  onProjectRole: (projectId: string, role: ProjectRole | null) => void
  onWorkspaceRole: (workspaceId: string, role: WorkspaceRole | null) => void
}

function ProjectBlock({ project, value, onProjectRole, onWorkspaceRole }: ProjectBlockProps) {
  const nameId = useId()
  const covering = coveringRole(value, project.id)

  function handleChange(option: string) {
    onProjectRole(project.id, fromOption<ProjectRole>(option))
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 bg-muted/40 px-3.5 py-3">
        <Tile size="sm">{project.initial}</Tile>
        <span id={nameId} className="flex-1 text-sm font-semibold text-foreground">
          {project.name}
        </span>
        <Select
          value={covering ?? NO_ROLE}
          onValueChange={handleChange}
          options={PROJECT_ROLE_OPTIONS}
          aria-labelledby={nameId}
          className="h-8 w-40 text-xs"
        />
      </div>
      <ul aria-labelledby={nameId}>
        {project.workspaces.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            workspace={workspace}
            covering={covering}
            role={value.workspaces[workspace.id] ?? null}
            onChange={onWorkspaceRole}
          />
        ))}
      </ul>
    </div>
  )
}

interface WorkspaceRowProps {
  workspace: WorkspaceChip
  covering: ProjectRole | null
  role: WorkspaceRole | null
  onChange: (workspaceId: string, role: WorkspaceRole | null) => void
}

function WorkspaceRow({ workspace, covering, role, onChange }: WorkspaceRowProps) {
  const nameId = useId()

  function handleChange(option: string) {
    onChange(workspace.id, fromOption<WorkspaceRole>(option))
  }

  return (
    <li className="flex items-center gap-3 border-t border-border py-2.5 pl-14 pr-3.5">
      <WorkspaceDot colour={workspace.colour} size="md" />
      <span id={nameId} className="flex-1 text-xs text-foreground">
        {workspace.name}
      </span>
      {covering ? (
        <span className="text-2xs text-muted-foreground">
          Covered by {PROJECT_ROLE_LABEL[covering]}
        </span>
      ) : (
        <Select
          value={role ?? NO_ROLE}
          onValueChange={handleChange}
          options={WORKSPACE_ROLE_OPTIONS}
          aria-labelledby={nameId}
          className="h-8 w-40 text-xs"
        />
      )}
    </li>
  )
}
