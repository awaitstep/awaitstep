import { useId, useState, type SubmitEvent } from 'react'
import { FolderPlus, Package, ShieldCheck } from 'lucide-react'
import { useCreateProject } from '../../data/dashboard/projects'
import { workspacePath, projectWorkspacesPath } from '../../lib/dashboard-paths'
import { slugify } from '@awaitstep/ir'
import { Button } from '../ui/button'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { ModalDialog } from '../ui/modal-dialog'
import { Tile } from '../ui/tile'
import { WorkspaceDot } from '../ui/workspace-dot'
import { useGoTo } from '../navigation/router-shell-link'

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  org: { slug: string; name: string }
  /** `import`: after creating, open the new workspace's import dialog (P2 reads `?new=import`). */
  then?: 'import'
}

/** "Create a project": name (with its URL), description, what comes with it. Lands in its Default workspace. */
export function NewProjectDialog({ open, onOpenChange, org, then }: NewProjectDialogProps) {
  const formId = useId()
  const createProject = useCreateProject(org.slug)
  const goTo = useGoTo()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const slug = slugify(name, '')

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    createProject.mutate(
      { name, description: description || undefined },
      {
        onSuccess: ({ project, workspace }) => {
          const slugs = { org: org.slug, project: project.slug, workspace: workspace.slug }
          // A new project opens on its own page, where its welcome is; Import goes straight on.
          goTo(
            then === 'import'
              ? `${workspacePath(slugs, 'workflows')}?new=import`
              : projectWorkspacesPath(slugs),
          )
        },
      },
    )
  }

  function handleNameChange(next: string) {
    setName(next)
    createProject.reset()
  }

  const urlHint = `URL: awaitstep.dev/${org.slug}/${slug || '…'}`

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      leading={
        <Tile tone="ok" size="lg">
          <FolderPlus />
        </Tile>
      }
      title="Create a project"
      description="Group related workflows and workspaces."
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={createProject.isPending}>
            Create project
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        <FormField
          label="Project name"
          hint={urlHint}
          error={createProject.error?.message}
          required
        >
          <Input
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            autoFocus
          />
        </FormField>
        <FormField label="Description" optional>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What lives here?"
          />
        </FormField>
        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4">
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            What you’ll get
          </span>
          <span className="flex items-center gap-2.5 text-sm text-foreground/90">
            <WorkspaceDot colour="green" size="lg" />A{' '}
            <strong className="font-semibold">Default</strong> workspace to start building in
          </span>
          <span className="flex items-center gap-2.5 text-sm text-foreground/90">
            <ShieldCheck className="size-4 shrink-0 text-status-info" aria-hidden="true" />
            You as project admin. Invite others after
          </span>
          <span className="flex items-center gap-2.5 text-sm text-foreground/90">
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {org.name}’s nodes and variables, already available
          </span>
        </div>
      </form>
    </ModalDialog>
  )
}
