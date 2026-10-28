import { useId, useState, type SubmitEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { useCreateKey } from '../../data/dashboard/api-keys'
import { errorFieldOf } from '../../data/dashboard/errors'
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
import { SecretReveal } from '../ui/secret-reveal'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { GrantSummary } from './parts/grant-summary'
import { describeGrantCount, describeReach, presetPermissions } from './parts/key-permissions'
import { PermissionGrid } from './parts/permission-grid'

const EXPIRY_OPTIONS: { value: KeyExpiry; label: string }[] = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In 1 year' },
  { value: 'never', label: 'Never' },
]

/** The board's starting preset: Read only for org keys, Deploy & run below (D-P6-3). */
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
 * "Create an API key" (`CreateKey`): name, expiry, what it reaches,
 * permissions, then the one-time reveal of the key (D-P6-1..3).
 */
export function CreateKeyDialog({
  org,
  start,
  project,
  workspace: startWorkspace,
  onClose,
}: CreateKeyDialogProps) {
  // Loaded here, so pages don't fetch it until the dialog opens.
  const workspaceList = useWorkspaces(org.slug, project?.slug ?? '', { enabled: !!project })
  const workspaces = workspaceList.data ?? []
  const formId = useId()
  const create = useCreateKey(org.slug)
  const [name, setName] = useState('')
  const [expires, setExpires] = useState<KeyExpiry>('30')
  const [level, setLevel] = useState<KeyLevel>(start)
  // The explicit pick; until then the page's workspace, else the first (worked out each
  // render, so a list that arrives after opening is still used).
  const [pickedWorkspace, setPickedWorkspace] = useState<string | null>(null)
  const workspace = pickedWorkspace ?? startWorkspace ?? workspaces[0]?.slug ?? ''
  const [permissions, setPermissions] = useState(() => startingPermissions(start))
  const [created, setCreated] = useState<CreatedKey | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  const orgScope = useScope({ org: org.slug }).data
  const projectScope = useScope({ org: org.slug, project: project?.slug }).data
  const workspaceScope = useScope({
    org: org.slug,
    project: project?.slug,
    workspace: workspace || undefined,
  }).data
  const workspaceName = workspaces.find((w) => w.slug === workspace)?.name ?? ''

  const levelOptions: RadioCardOption<KeyLevel>[] = [
    {
      value: 'organization',
      title: 'Organization',
      description: `${org.name} admin only. No workflow access.`,
      disabledReason: reason(orgScope?.found ? orgScope.org.viewerCan.manageSettings : undefined),
    },
  ]
  if (project) {
    levelOptions.push(
      {
        value: 'project',
        title: project.name,
        description: 'Every workspace in the project.',
        disabledReason: reason(
          projectScope?.found ? projectScope.project?.viewerCan.manageKeys : undefined,
        ),
      },
      {
        value: 'workspace',
        title: 'One workspace',
        description: `Pick it below. Nothing else in ${project.name}.`,
        // Only unavailable with nothing to pick; a workspace you can't manage is said
        // under the picker, so choosing another stays possible.
        disabledReason:
          workspaceList.data && workspaces.length === 0 ? 'No workspace to pick' : undefined,
      },
    )
  }

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

  function handleLevel(next: KeyLevel) {
    setLevel(next)
    setPermissions(startingPermissions(next))
    create.reset()
  }

  function handlePermissions(next: KeyPermissions) {
    setPermissions(next)
    create.reset()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    create.mutate(
      {
        level,
        project: project?.slug,
        workspace: level === 'workspace' ? workspace : undefined,
        name,
        expires,
        permissions,
      },
      { onSuccess: setCreated },
    )
  }

  function renderWorkspacePicker(value: KeyLevel) {
    if (value !== 'workspace' || !project) return null
    return (
      <FormField label="Workspace" hint={`in ${project.name}`} error={workspaceReason}>
        <Select
          value={workspace}
          onValueChange={setPickedWorkspace}
          options={workspaces.map((w) => ({ value: w.slug, label: w.name }))}
          className="w-56"
        />
      </FormField>
    )
  }

  const field = errorFieldOf(create.error)
  const nameError = field === 'name' ? create.error?.message : undefined
  const otherError = create.error && field !== 'name' ? create.error.message : undefined
  const isCopied = created !== null && copied === created.secret
  const reach = describeReach(level, {
    project: project?.name ?? '',
    workspace: workspaceName,
  })
  const workspaceCan = workspaceScope?.found
    ? workspaceScope.workspace?.viewerCan.manageKeys
    : undefined
  const workspaceReason = workspaceCan && !workspaceCan.allowed ? workspaceCan.reason : undefined
  const levelReason =
    levelOptions.find((o) => o.value === level)?.disabledReason ??
    (level === 'workspace' ? (workspaceReason ?? reason(workspaceCan)) : undefined)
  const canCreate = !create.isPending && levelReason === undefined

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
        size="lg"
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
              <strong className="font-semibold">{created.key.name}</strong> is ready.{' '}
              {describeReach(created.key.level, {
                project: project?.name ?? '',
                workspace: created.key.workspace?.name ?? '',
              })}
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
            <RadioCardGroup
              legend="What it reaches"
              layout="grid"
              value={level}
              onChange={handleLevel}
              options={levelOptions}
              renderExtra={renderWorkspacePicker}
            />
            <PermissionGrid
              // A new level starts from its own preset and catalog.
              key={level}
              level={level}
              value={permissions}
              onChange={handlePermissions}
              note={reach}
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
