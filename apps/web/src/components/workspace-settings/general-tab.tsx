import { useState } from 'react'
import { format } from 'date-fns'
import { ArrowRightLeft, Trash2 } from 'lucide-react'
import { useSetLock } from '../../data/dashboard/locks'
import { useDeleteWorkspace, useUpdateWorkspace } from '../../data/dashboard/workspaces'
import { projectPath, projectSettingsPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import type { WorkspaceScope } from '../../types/dashboard/scope'
import type { Workspace } from '../../types/dashboard/workspaces'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DangerRow, DangerZone } from '../ui/danger-zone'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { LockSwitch } from '../ui/lock-switch'
import { SwatchPicker } from '../ui/swatch-picker'
import type { WorkspaceColour } from '../ui/workspace-colour'
import { FormCard } from '../ui/form-card'
import { useGoTo } from '../navigation/router-shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { MoveWorkflowsDialog } from './move-workflows-dialog'

const FORM_ID = 'workspace-general'

interface GeneralTabProps {
  slugs: WorkspaceSlugs
  scope: WorkspaceScope
  projectName: string
}

interface FormValues {
  name: string
  description: string
  colour: WorkspaceColour
}

function valuesOf(workspace: Workspace): FormValues {
  return {
    name: workspace.name,
    description: workspace.description ?? '',
    colour: workspace.colour,
  }
}

function lockText(workspace: Workspace, on: boolean, projectName: string): string {
  if (workspace.lock.inherited) {
    return `On, because ${projectName} is locked, and that covers every workspace in it. A workspace can also be locked on its own while the project isn’t: its admins and editors can do that here.`
  }
  return on
    ? `On. ${workspace.name} can’t be deleted until its admins or editors turn this off.`
    : `Off. Turn on to stop ${workspace.name} from being deleted by mistake. Its admins and editors can change this.`
}

/** Workspace settings → General (`Access`): name, description, colour, and the danger zone. */
export function GeneralTab({ slugs, scope, projectName }: GeneralTabProps) {
  const workspace = scope.workspace
  const can = scope.viewerCan
  const update = useUpdateWorkspace(slugs)
  const remove = useDeleteWorkspace(slugs)
  const setLock = useSetLock({ level: 'workspace', ...slugs })
  const goTo = useGoTo()
  const [values, setValues] = useState(valuesOf(workspace))
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null)

  const saved = valuesOf(workspace)
  // Compared and sent trimmed, as the server stores them, so "Sales " isn't a change.
  const name = values.name.trim()
  const description = values.description.trim()
  const dirty =
    name !== saved.name || description !== saved.description || values.colour !== saved.colour
  const readOnly = !can.manageSettings.allowed

  function handleChange<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [field]: value }))
    update.reset()
  }

  function handleColour(colour: WorkspaceColour) {
    handleChange('colour', colour)
  }

  function handleSubmit(event: React.SubmitEvent) {
    event.preventDefault()
    update.mutate({ name, description: description || null, colour: values.colour })
  }

  function handleLockChange(on: boolean) {
    setLock.mutate(on)
  }

  function handleOpenMove() {
    setDialog('move')
  }

  function handleOpenDelete() {
    remove.reset()
    setDialog('delete')
  }

  function handleCloseDialog() {
    setDialog(null)
  }

  function handleDeleteOpenChange(open: boolean) {
    if (!open) setDialog(null)
  }

  function handleDelete() {
    // The project lands in a workspace that still exists.
    remove.mutate(undefined, { onSuccess: () => goTo(projectPath(slugs)) })
  }

  const own = workspace.lock.own
  const inherited = workspace.lock.inherited
  const locked = own !== null || inherited !== null
  const lockSetBy = own
    ? { name: own.setBy.name, date: format(new Date(own.setAt), 'd MMM') }
    : undefined
  const lockFrom = inherited
    ? { name: inherited.fromName, href: projectSettingsPath(slugs, 'general') }
    : undefined
  // A change in flight holds the switch; a refused one says why where the state is described.
  const lockReason = setLock.isPending
    ? 'Saving…'
    : can.toggleLock.allowed
      ? undefined
      : can.toggleLock.reason
  const lockDescription = setLock.error?.message ?? lockText(workspace, locked, projectName)
  const moveReason = can.manageSettings.allowed ? undefined : can.manageSettings.reason
  const deleteReason = can.delete.allowed ? undefined : can.delete.reason
  const { workflows, functions } = workspace.counts
  const deleteSummary = `Deletes ${plural(workflows, 'workflow')}, ${plural(functions, 'function')} and their run history. Blocked while other workspaces call its shared workflows. A project’s last workspace can’t be deleted.`
  const deleteWarning = `This removes ${plural(workflows, 'workflow')}, ${plural(functions, 'function')} and all their history from ${projectName}. It can’t be undone.`
  const deleteDescription = remove.error?.message ?? deleteWarning
  const nameError = update.error?.message

  return (
    <>
      {!readOnly && (
        <TopBarContent>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!dirty || update.isPending}>
            Save changes
          </Button>
        </TopBarContent>
      )}
      <FormCard id={FORM_ID} onSubmit={handleSubmit}>
        <FormField label="Name" error={nameError}>
          <Input
            value={values.name}
            onChange={(e) => handleChange('name', e.target.value)}
            disabled={readOnly}
          />
        </FormField>
        <FormField label="Description">
          <Input
            value={values.description}
            onChange={(e) => handleChange('description', e.target.value)}
            disabled={readOnly}
          />
        </FormField>
        <SwatchPicker value={values.colour} onChange={handleColour} />
      </FormCard>
      <DangerZone>
        <LockSwitch
          locked={locked}
          onChange={handleLockChange}
          description={lockDescription}
          setBy={setLock.error ? undefined : lockSetBy}
          inheritedFrom={lockFrom}
          disabledReason={lockReason}
        />
        <DangerRow
          icon={<ArrowRightLeft aria-hidden="true" />}
          title="Move workflows out"
          description={`Send some or all of ${workspace.name}’s workflows and functions to another workspace in ${projectName}.`}
          action={
            <BlockedAction reason={moveReason}>
              <Button type="button" variant="outline" size="sm" onClick={handleOpenMove}>
                Move workflows
              </Button>
            </BlockedAction>
          }
        />
        <DangerRow
          icon={<Trash2 aria-hidden="true" />}
          tone="danger"
          title="Delete this workspace"
          description={deleteSummary}
          action={
            <BlockedAction reason={deleteReason}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-status-error"
                onClick={handleOpenDelete}
              >
                Delete {workspace.name}
              </Button>
            </BlockedAction>
          }
        />
      </DangerZone>
      {dialog === 'move' && (
        <MoveWorkflowsDialog
          slugs={slugs}
          workspaceName={workspace.name}
          projectName={projectName}
          onClose={handleCloseDialog}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={handleDeleteOpenChange}
          icon={Trash2}
          title={`Delete ${workspace.name}?`}
          description={deleteDescription}
          confirmLabel={`Delete ${workspace.name}`}
          confirmText={workspace.name}
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
