import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useMoveProject } from '../../data/dashboard/projects'
import { useOrgs } from '../../data/dashboard/session'
import {
  dashboardPath,
  projectPagePath,
  withNewDialog,
  type ProjectSlugs,
} from '../../lib/dashboard-paths'
import { Button, buttonVariants } from '../ui/button'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { ShellLink } from '../ui/shell-link'
import { Tile } from '../ui/tile'
import { useGoTo } from '../navigation/router-shell-link'

interface MoveProjectDialogProps {
  slugs: ProjectSlugs
  projectName: string
  onClose: () => void
}

/**
 * Move a project to another organization (no board; D-P3-5). Lists only the
 * orgs where the viewer is an owner or admin; lands on the project's General
 * page at its new address.
 */
export function MoveProjectDialog({ slugs, projectName, onClose }: MoveProjectDialogProps) {
  const orgs = useOrgs()
  const move = useMoveProject(slugs.org, slugs.project)
  const goTo = useGoTo()
  const targets = (orgs.data ?? []).filter(
    (org) => org.slug !== slugs.org && (org.role === 'owner' || org.role === 'admin'),
  )
  const [picked, setPicked] = useState<string | null>(null)
  const target = picked ?? targets[0]?.slug ?? null

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handlePick(slug: string) {
    setPicked(slug)
    move.reset()
  }

  function handleMove() {
    if (!target) return
    move.mutate(target, {
      onSuccess: (moved) => goTo(projectPagePath(moved, 'settings')),
    })
  }

  const canMove = target !== null
  const actions = canMove ? (
    <>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button type="button" onClick={handleMove} disabled={move.isPending}>
        Move project
      </Button>
    </>
  ) : (
    <Button type="button" onClick={onClose}>
      Close
    </Button>
  )

  let body
  if (!orgs.data) {
    body = <p className="text-sm text-muted-foreground">Loading your organizations…</p>
  } else if (!canMove) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/90">
          You aren’t an owner or admin of another organization, so there’s nowhere to move{' '}
          {projectName} to.
        </p>
        <ShellLink
          href={withNewDialog(dashboardPath(), 'org')}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'self-start' })}
        >
          New organization
        </ShellLink>
      </div>
    )
  } else {
    body = (
      <FormField label="Move to" error={move.error?.message}>
        <Select
          value={target}
          onValueChange={handlePick}
          options={targets.map((org) => ({ value: org.slug, label: org.name }))}
        />
      </FormField>
    )
  }

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="sm"
      leading={
        <Tile tone="warn" size="lg">
          <ArrowRight />
        </Tile>
      }
      title={`Move ${projectName}`}
      description="Its workspaces, workflows and project keys go with it. Connections stay behind and must be reconnected."
      actions={actions}
    >
      {body}
    </ModalDialog>
  )
}
