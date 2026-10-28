import { useId, useState, type SubmitEvent } from 'react'
import { X } from 'lucide-react'
import { useProjectMembers } from '../../data/dashboard/members'
import { useProjectSetup } from '../../data/dashboard/setup'
import { useCreateWorkspace } from '../../data/dashboard/workspaces'
import { workspacePath, type ProjectSlugs } from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import { cn } from '../../lib/utils'
import type { Person } from '../../types/dashboard/session'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { RadioCardGroup, type RadioCardOption } from '../ui/choice-card'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { SwatchPicker } from '../ui/swatch-picker'
import { WORKSPACE_TILE_CLASS, type WorkspaceColour } from '../ui/workspace-colour'
import { useGoTo } from '../navigation/router-shell-link'
import { PersonPicker } from './person-picker'
import { inheritedVariables, projectAdmins, wholeProjectIds } from './project-pool'

type Access = 'admins' | 'pick'

interface NewWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slugs: ProjectSlugs
  org: { slug: string; name: string }
  projectName: string
}

/**
 * "Create a workspace" (`NewWorkspace`): name, colour, who can get in, and what
 * it inherits. People picked now join as Editors (D-P3-8). Lands in the new,
 * empty workspace.
 */
export function NewWorkspaceDialog({
  open,
  onOpenChange,
  slugs,
  org,
  projectName,
}: NewWorkspaceDialogProps) {
  const formId = useId()
  const create = useCreateWorkspace(slugs.org, slugs.project)
  const members = useProjectMembers(slugs.org, slugs.project)
  const setup = useProjectSetup(slugs.org, slugs.project)
  const goTo = useGoTo()
  const [name, setName] = useState('')
  const [colour, setColour] = useState<WorkspaceColour>('green')
  const [access, setAccess] = useState<Access>('admins')
  const [picked, setPicked] = useState<Person[]>([])
  const shownName = name.trim() || 'the workspace'

  const options: RadioCardOption<Access>[] = [
    {
      value: 'admins',
      title: 'Only project admins for now',
      description: 'Add people from Workspace settings later',
    },
    {
      value: 'pick',
      title: 'Choose people now',
      description: `They’ll see ${shownName} and nothing else in ${projectName}`,
    },
  ]

  const exclude = new Set([
    ...(members.data ? wholeProjectIds(members.data) : []),
    ...picked.map((p) => p.id),
  ])

  const alsoGets = [
    members.data && plural(projectAdmins(members.data).length, 'admin'),
    setup.data && plural(setup.data.projectKeys, 'project key'),
    setup.data && plural(inheritedVariables(setup.data), 'variable'),
    'Shared library',
  ].filter((item) => typeof item === 'string')

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    create.mutate(
      {
        name,
        colour,
        access:
          access === 'pick'
            ? { kind: 'pick', people: picked.map((p) => ({ userId: p.id, role: 'editor' })) }
            : { kind: 'admins' },
      },
      { onSuccess: (workspace) => goTo(workspacePath({ ...slugs, workspace: workspace.slug })) },
    )
  }

  function handleNameChange(next: string) {
    setName(next)
    create.reset()
  }

  function handlePick(person: Person) {
    setPicked((list) => [...list, person])
  }

  function handleRemove(id: string) {
    setPicked((list) => list.filter((p) => p.id !== id))
  }

  function handleCancel() {
    onOpenChange(false)
  }

  function renderPeople(value: Access) {
    if (value !== 'pick') return null
    return (
      <div role="group" aria-label="People who can get in" className="flex flex-wrap gap-1.5">
        {picked.map((person) => (
          <Badge key={person.id} variant="success" className="gap-1.5 py-1 pr-1">
            {person.name}
            <button
              type="button"
              aria-label={`Remove ${person.name}`}
              onClick={() => handleRemove(person.id)}
              className="rounded-full p-0.5 hover:bg-status-success/20"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <PersonPicker org={org} exclude={exclude} onPick={handlePick} />
      </div>
    )
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      leading={
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 items-center justify-center rounded-xl text-lg font-semibold',
            WORKSPACE_TILE_CLASS[colour],
          )}
        >
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      }
      title="Create a workspace"
      description={`A separate space in ${projectName} with its own people, keys and workflows.`}
      actions={
        <>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={create.isPending}>
            Create workspace
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-5">
        <FormField label="Name" error={create.error?.message} required>
          <Input
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            autoFocus
          />
        </FormField>
        <SwatchPicker value={colour} onChange={setColour} />
        <RadioCardGroup
          legend="Who can get in"
          value={access}
          onChange={setAccess}
          options={options}
          renderExtra={renderPeople}
        />
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-4 py-3.5 text-2xs text-muted-foreground">
          <span>Also gets, from {projectName}:</span>
          {alsoGets.map((item) => (
            <Badge key={item} className="font-normal">
              {item}
            </Badge>
          ))}
        </div>
      </form>
    </ModalDialog>
  )
}
