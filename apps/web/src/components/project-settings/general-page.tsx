import { useState, type SubmitEvent } from 'react'
import { format } from 'date-fns'
import { ArrowRight, Trash2 } from 'lucide-react'
import { useDeleteProject, useUpdateProject } from '../../data/dashboard/projects'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useSetLock } from '../../data/dashboard/locks'
import { useWorkspaces } from '../../data/dashboard/workspaces'
import { orgPath, projectSettingsPath, type ProjectSlugs } from '../../lib/dashboard-paths'
import { plural } from '../../lib/plural'
import type { Project } from '../../types/dashboard/projects'
import type { ProjectScope } from '../../types/dashboard/scope'
import { BlockedAction } from '../ui/blocked-action'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { DangerRow, DangerZone } from '../ui/danger-zone'
import { FormField } from '../ui/form-field'
import { Input } from '../ui/input'
import { InputGroup } from '../ui/input-group'
import { LockSwitch } from '../ui/lock-switch'
import { FormCard } from '../ui/form-card'
import { PageBody, PageIntro } from '../shell/page-intro'
import { useGoTo } from '../navigation/router-shell-link'
import { TopBarContent } from '../navigation/top-bar-slot'
import { MoveProjectDialog } from './move-project-dialog'
import { useProjectScope } from './use-project-scope'

const FORM_ID = 'project-general'

interface GeneralPageProps {
  slugs: ProjectSlugs
}

/** "Sales, IT and Support". */
function listNames(names: string[]): string {
  if (names.length < 2) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function lockText(name: string, on: boolean): string {
  return on
    ? `On. ${name} and its workspaces can’t be deleted until a project admin or org owner turns this off.`
    : `Off. Turn on to stop ${name} and its workspaces from being deleted by mistake. Project admins and org owners can change this.`
}

interface FormValues {
  name: string
  slug: string
  description: string
}

function valuesOf(project: Project): FormValues {
  return { name: project.name, slug: project.slug, description: project.description ?? '' }
}

/** `/{org}/{project}/settings/general` (`ProjectGeneral`): name, URL, description, and the danger zone. */
export function GeneralPage({ slugs }: GeneralPageProps) {
  const scope = useProjectScope(slugs)
  if (!scope) return null
  // Keyed so the form starts again from the saved values after a save.
  return (
    <GeneralSettings key={scope.project.project.updatedAt} slugs={slugs} scope={scope.project} />
  )
}

function GeneralSettings({ slugs, scope }: { slugs: ProjectSlugs; scope: ProjectScope }) {
  const project = scope.project
  const can = scope.viewerCan
  const update = useUpdateProject(slugs.org, slugs.project)
  const remove = useDeleteProject(slugs.org, slugs.project)
  const setLock = useSetLock({ level: 'project', ...slugs })
  const workspaces = useWorkspaces(slugs.org, slugs.project)
  const goTo = useGoTo()
  const [values, setValues] = useState(valuesOf(project))
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null)

  const saved = valuesOf(project)
  // Compared and sent trimmed, as the server stores them, so "Project 101 " isn't a change.
  const trimmed = {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim(),
  }
  const dirty =
    trimmed.name !== saved.name ||
    trimmed.slug !== saved.slug ||
    trimmed.description !== saved.description
  const readOnly = !can.manageSettings.allowed
  const lock = project.lock.own
  const names = (workspaces.data ?? []).map((w) => w.name)
  const workflows = (workspaces.data ?? []).reduce((n, w) => n + w.counts.workflows, 0)

  function handleChange(field: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    update.reset()
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault()
    update.mutate(
      {
        name: trimmed.name,
        description: trimmed.description || null,
        ...(trimmed.slug !== saved.slug && { slug: trimmed.slug }),
      },
      {
        onSuccess: (updated) => {
          if (updated.slug !== slugs.project) {
            goTo(projectSettingsPath({ org: slugs.org, project: updated.slug }, 'general'))
          }
        },
      },
    )
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
    remove.mutate(undefined, { onSuccess: () => goTo(orgPath(slugs.org)) })
  }

  // Each error sits under the field it names; the rest under the name.
  const error = update.error?.message
  const slugError = errorFieldOf(update.error) === 'slug' ? error : undefined
  const nameError = slugError ? undefined : error
  const lockSetBy = lock
    ? { name: lock.setBy.name, date: format(new Date(lock.setAt), 'd MMM') }
    : undefined
  // The summary and the confirm quote these counts, so Delete waits for them.
  const deleteReason = !can.delete.allowed
    ? can.delete.reason
    : workspaces.data
      ? undefined
      : 'Counting what would be deleted…'
  const moveReason = can.move.allowed ? undefined : can.move.reason
  const lockReason = can.toggleLock.allowed ? undefined : can.toggleLock.reason
  const deleteSummary = `Deletes ${plural(names.length, 'workspace')}, ${plural(workflows, 'workflow')}, their run history and every project key. Deployed workers keep running on Cloudflare until you remove them.`
  const deleteWarning = `This removes ${listNames(names)}, ${plural(workflows, 'workflow')} and all their history. It can’t be undone.`
  const deleteDescription = remove.error?.message ?? deleteWarning

  return (
    <>
      {!readOnly && (
        <TopBarContent>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!dirty || update.isPending}>
            Save changes
          </Button>
        </TopBarContent>
      )}
      <PageBody>
        <PageIntro
          title="General"
          description={`${project.name}’s name and address, and the actions that can’t be undone.`}
        />
        <FormCard id={FORM_ID} onSubmit={handleSubmit}>
          <FormField label="Project name" error={nameError}>
            <Input
              value={values.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={readOnly}
            />
          </FormField>
          <FormField
            label="URL"
            hint="Changing it breaks bookmarked links to this project."
            error={slugError}
          >
            <InputGroup prefix={`awaitstep.dev/${slugs.org}/`}>
              <Input
                value={values.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                disabled={readOnly}
              />
            </InputGroup>
          </FormField>
          <FormField label="Description">
            <Input
              value={values.description}
              onChange={(e) => handleChange('description', e.target.value)}
              disabled={readOnly}
            />
          </FormField>
        </FormCard>
        <DangerZone>
          <LockSwitch
            locked={lock !== null}
            onChange={handleLockChange}
            description={lockText(project.name, lock !== null)}
            setBy={lockSetBy}
            disabledReason={lockReason}
          />
          <DangerRow
            icon={<ArrowRight aria-hidden="true" />}
            title="Move to another organization"
            description="Its workspaces, workflows and project keys go with it. Connections stay behind and must be reconnected."
            action={
              <BlockedAction reason={moveReason}>
                <Button type="button" variant="outline" size="sm" onClick={handleOpenMove}>
                  Move project
                </Button>
              </BlockedAction>
            }
          />
          <DangerRow
            icon={<Trash2 aria-hidden="true" />}
            tone="danger"
            title="Delete this project"
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
                  Delete project
                </Button>
              </BlockedAction>
            }
          />
        </DangerZone>
      </PageBody>
      {dialog === 'move' && (
        <MoveProjectDialog slugs={slugs} projectName={project.name} onClose={handleCloseDialog} />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={handleDeleteOpenChange}
          icon={Trash2}
          title={`Delete ${project.name}?`}
          description={deleteDescription}
          confirmLabel="Delete project"
          confirmText={project.name}
          onConfirm={handleDelete}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
