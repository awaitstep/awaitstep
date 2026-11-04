import { useId, useState, type SubmitEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useCreateKey } from '../../data/dashboard/api-keys'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useProjects } from '../../data/dashboard/projects'
import { useScope, useWorkspaces } from '../../data/dashboard/workspaces'
import { cn } from '../../lib/utils'
import type {
  CreatedKey,
  KeyExpiry,
  KeyLevel,
  KeyPermissions,
} from '../../types/dashboard/api-keys'
import type { Allowed } from '../../types/dashboard/scope'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { RadioCardGroup, type RadioCardOption } from '../ui/choice-card'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { SearchableMultiSelect } from '../ui/searchable-select'
import { SecretReveal } from '../ui/secret-reveal'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { GrantSummary } from './parts/grant-summary'
import { describeGrantCount, presetPermissions } from './parts/key-permissions'
import { PermissionGrid } from './parts/permission-grid'

// The "Where it works" choice. A key reaches a SET: at the organization,
// either the whole org or a set of projects; at a project, that project or a
// set of its workspaces; at a workspace, just that workspace.
type Mode = 'org' | 'projects' | 'project' | 'workspaces' | 'workspace'

const EXPIRY_OPTIONS: { value: KeyExpiry; label: string }[] = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In 1 year' },
  { value: 'never', label: 'Never' },
]

/** The key level each mode mints at — which @awaitstep/ir catalog the grid comes from. */
function levelOf(mode: Mode): KeyLevel {
  if (mode === 'org') return 'organization'
  if (mode === 'projects' || mode === 'project') return 'project'
  return 'workspace'
}

/** The board's starting preset: Read only for org keys, Deploy & run below. */
function startingPermissions(level: KeyLevel): KeyPermissions {
  return presetPermissions(level, level === 'organization' ? 'read' : 'deploy-run')
}

function reason(can: Allowed | undefined): string | undefined {
  if (!can) return 'Loading…'
  return can.allowed ? undefined : can.reason
}

interface CreateKeyDialogProps {
  org: { slug: string; name: string }
  /** The level the page it opened from manages. */
  start: KeyLevel
  /** The project a project or workspace key would belong to; none means org keys only. */
  project?: { slug: string; name: string }
  /** The workspace it opened from, at workspace level. */
  workspace?: string
  onClose: () => void
}

/**
 * "Create an API key": name, expiry, the scope set it reaches, permissions,
 * then the one-time reveal of the secret.
 */
export function CreateKeyDialog({
  org,
  start,
  project,
  workspace: startWorkspace,
  onClose,
}: CreateKeyDialogProps) {
  const formId = useId()
  const create = useCreateKey(org.slug)
  const [name, setName] = useState('')
  const [expires, setExpires] = useState<KeyExpiry>('30')
  const [mode, setMode] = useState<Mode>(start === 'organization' ? 'org' : start)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([])
  const [permissions, setPermissions] = useState(() =>
    startingPermissions(levelOf(start === 'organization' ? 'org' : start)),
  )
  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  // Loaded lazily, only for the pickers each level offers.
  const projectList = useProjects(org.slug, { enabled: start === 'organization' })
  const projects = projectList.data ?? []
  const workspaceList = useWorkspaces(org.slug, project?.slug ?? '', { enabled: !!project })
  const workspaces = workspaceList.data ?? []

  const orgScope = useScope({ org: org.slug }).data
  const projectScope = useScope({ org: org.slug, project: project?.slug }).data
  const workspaceScope = useScope({
    org: org.slug,
    project: project?.slug,
    workspace: startWorkspace,
  }).data

  const orgCan = orgScope?.found ? orgScope.org.viewerCan.manageSettings : undefined
  const projectCan = projectScope?.found ? projectScope.project?.viewerCan.manageKeys : undefined
  const workspaceCan = workspaceScope?.found
    ? workspaceScope.workspace?.viewerCan.manageKeys
    : undefined

  const level = levelOf(mode)

  const modeOptions: RadioCardOption<Mode>[] =
    start === 'organization'
      ? [
          {
            value: 'org',
            title: 'Organization',
            description: `${org.name} admin only. No workflow access.`,
            disabledReason: reason(orgCan),
          },
          {
            value: 'projects',
            title: 'Specific projects',
            description: 'One key for a set of projects.',
            disabledReason:
              reason(orgCan) ??
              (projectList.data && projects.length === 0 ? 'No projects to pick' : undefined),
          },
        ]
      : start === 'project' && project
        ? [
            {
              value: 'project',
              title: project.name,
              description: 'Every workspace in the project.',
              disabledReason: reason(projectCan),
            },
            {
              value: 'workspaces',
              title: 'Specific workspaces',
              description: `A set of workspaces in ${project.name}.`,
              disabledReason:
                reason(projectCan) ??
                (workspaceList.data && workspaces.length === 0
                  ? 'No workspaces to pick'
                  : undefined),
            },
          ]
        : []

  function handleOpenChange(open: boolean) {
    if (!open) handleClose()
  }

  function handleClose() {
    if (created && copied !== created.secret) setConfirmClose(true)
    else onClose()
  }

  function handleConfirmCloseChange(open: boolean) {
    if (!open) setConfirmClose(false)
  }

  function handleName(value: string) {
    setName(value)
    create.reset()
  }

  function handleExpires(value: string) {
    setExpires(value as KeyExpiry)
  }

  function handleMode(next: Mode) {
    setMode(next)
    setPermissions(startingPermissions(levelOf(next)))
    create.reset()
  }

  function handlePermissions(next: KeyPermissions) {
    setPermissions(next)
    create.reset()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    const base = { name, expires, permissions }
    const input =
      mode === 'org'
        ? { ...base, level: 'organization' as const }
        : mode === 'projects'
          ? { ...base, level: 'project' as const, projectIds }
          : mode === 'project'
            ? { ...base, level: 'project' as const, project: project?.slug }
            : mode === 'workspaces'
              ? { ...base, level: 'workspace' as const, project: project?.slug, workspaceIds }
              : {
                  ...base,
                  level: 'workspace' as const,
                  project: project?.slug,
                  workspace: startWorkspace,
                }
    create.mutate(input, { onSuccess: setCreated })
  }

  function renderPicker(value: Mode) {
    if (value === 'projects') {
      return (
        <SearchableMultiSelect
          label="Projects"
          values={projectIds}
          onChange={setProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          searchPlaceholder="Search projects"
          summary={(n) => (n === 0 ? 'Choose projects' : n === 1 ? '1 project' : `${n} projects`)}
        />
      )
    }
    if (value === 'workspaces') {
      return (
        <SearchableMultiSelect
          label="Workspaces"
          values={workspaceIds}
          onChange={setWorkspaceIds}
          options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
          searchPlaceholder="Search workspaces"
          summary={(n) =>
            n === 0 ? 'Choose workspaces' : n === 1 ? '1 workspace' : `${n} workspaces`
          }
        />
      )
    }
    return null
  }

  const field = errorFieldOf(create.error)
  const nameError = field === 'name' ? create.error?.message : undefined
  const otherError = create.error && field !== 'name' ? create.error.message : undefined
  const isCopied = created !== null && copied === created.secret

  const modeCan =
    mode === 'org'
      ? orgCan
      : mode === 'workspace'
        ? workspaceCan
        : mode === 'projects'
          ? orgCan
          : projectCan
  const setChosen =
    mode === 'projects'
      ? projectIds.length > 0
      : mode === 'workspaces'
        ? workspaceIds.length > 0
        : true
  const canCreate = !create.isPending && (modeCan?.allowed ?? false) && setChosen

  const footerStart = created ? (
    <span className={cn('text-2xs', isCopied ? 'text-status-success' : 'text-status-warning')}>
      {isCopied
        ? 'Key copied. You can close this.'
        : 'Copy the key before closing. It won’t be shown again.'}
    </span>
  ) : (
    <span className="text-2xs text-muted-foreground">{describeGrantCount(level, permissions)}</span>
  )

  const actions = created ? (
    <Button type="button" onClick={handleClose}>
      Done
    </Button>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={!canCreate}>
        Create key
      </Button>
    </>
  )

  return (
    <>
      <ModalDialog
        open
        onOpenChange={handleOpenChange}
        size="xl"
        leading={
          <Tile tone="warn" size="lg">
            <KeyRound />
          </Tile>
        }
        title="Create an API key"
        description="Give it only what it needs. You’ll see the key once."
        footerStart={footerStart}
        actions={actions}
      >
        {created ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-foreground/90">
              <strong className="font-semibold">{created.key.name}</strong> is ready. Copy the key
              below — it won’t be shown again.
            </p>
            <SecretReveal
              label="Your API key"
              value={created.secret}
              warning="Copy it now and store it somewhere safe. This is the only time AwaitStep shows the full key. If you lose it, revoke it and create a new one."
              onCopied={setCopied}
            >
              <GrantSummary level={created.key.level} value={created.key.permissions} />
            </SecretReveal>
          </div>
        ) : (
          <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-5">
            {otherError && <Banner tone="warn">{otherError}</Banner>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
              <FormField label="Name" error={nameError}>
                <Input
                  value={name}
                  onChange={(e) => handleName(e.target.value)}
                  placeholder="CI deploys"
                  autoFocus
                />
              </FormField>
              <FormField label="Expires">
                <Select value={expires} onValueChange={handleExpires} options={EXPIRY_OPTIONS} />
              </FormField>
            </div>
            {modeOptions.length > 0 && (
              <RadioCardGroup
                legend="Where it works"
                layout="grid"
                value={mode}
                onChange={handleMode}
                options={modeOptions}
                renderExtra={renderPicker}
              />
            )}
            <PermissionGrid
              key={level}
              level={level}
              value={permissions}
              onChange={handlePermissions}
            />
          </form>
        )}
      </ModalDialog>
      {confirmClose && (
        <ConfirmDialog
          open
          onOpenChange={handleConfirmCloseChange}
          title="Close without copying?"
          description="You won’t see this key again. If you lose it, revoke it and create a new one."
          confirmLabel="Close anyway"
          cancelLabel="Go back"
          variant="warning"
          onConfirm={onClose}
        />
      )}
    </>
  )
}
