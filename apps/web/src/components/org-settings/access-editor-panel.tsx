import { useState } from 'react'
import { format } from 'date-fns'
import { usePersonAccess, useRemoveFromOrg, useSaveAccess } from '../../data/dashboard/org-settings'
import type { AccessDraft } from '../../types/dashboard/access'
import type { PersonAccess } from '../../types/dashboard/org-settings'
import type { Person } from '../../types/dashboard/session'
import { PersonAvatar } from '../ui/avatar-stack'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { FieldGroup } from '../ui/form-field'
import { SidePanel } from '../ui/side-panel'
import { ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { useProjects } from '../../data/dashboard/projects'
import { AccessTree } from '../access/parts/access-tree'
import { toAccessGrant } from '../access/parts/access-draft'
import { PersonPicker } from '../project-settings/person-picker'

interface AccessEditorPanelProps {
  org: { slug: string; name: string }
  /** The person to edit; null starts with a person picker (`?access=add`). */
  userId: string | null
  /** `?access=add&project=`: the project they're being added to, offered as Project member. */
  addToProject?: string
  /** Owners alone make owners and change an owner's access. */
  viewerIsOwner: boolean
  onClose: () => void
}

/**
 * Edit access (`AccessEditor`): org role, then a role per project or per
 * workspace, and where that lets them work. `?access=add` (Add people on a
 * project) picks the person first (D-P5-1).
 */
export function AccessEditorPanel({
  org,
  userId,
  addToProject,
  viewerIsOwner,
  onClose,
}: AccessEditorPanelProps) {
  const [picked, setPicked] = useState<string | null>(userId)
  const access = usePersonAccess(org.slug, picked)
  const projects = useProjects(org.slug)
  const addToId = projects.data?.find((p) => p.slug === addToProject)?.id

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handlePick(person: Person) {
    setPicked(person.id)
  }

  if (picked === null) {
    return (
      <SidePanel
        open
        onOpenChange={handleOpenChange}
        title="Add people"
        description={`Choose a person, then set what they can open.`}
        actions={
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        }
      >
        <FieldGroup legend="Person">
          <span>
            <PersonPicker org={org} exclude={new Set()} onPick={handlePick} />
          </span>
        </FieldGroup>
      </SidePanel>
    )
  }

  if (!access.data) {
    return (
      <SidePanel
        open
        onOpenChange={handleOpenChange}
        title="Edit access"
        actions={
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        }
      >
        {access.isError ? (
          <Banner tone="warn">{access.error.message}</Banner>
        ) : (
          <LoadingRegion label="Loading access">
            <ListCardSkeleton rows={3} trailing={1} />
          </LoadingRegion>
        )}
      </SidePanel>
    )
  }

  // Keyed by person, so picking someone else starts from their saved access.
  return (
    <AccessEditor
      key={picked}
      org={org}
      access={access.data}
      addToId={addToId}
      viewerIsOwner={viewerIsOwner}
      onClose={onClose}
    />
  )
}

/**
 * Where the editor starts: their saved access, plus Project member on the
 * project they're being added to, unless something already covers it.
 */
export function startingDraft(draft: AccessDraft, addToId: string | undefined): AccessDraft {
  if (!addToId || draft.orgRole !== 'member' || draft.projects[addToId]) return draft
  return { ...draft, projects: { ...draft.projects, [addToId]: 'member' } }
}

function AccessEditor({
  org,
  access,
  addToId,
  viewerIsOwner,
  onClose,
}: {
  org: { slug: string; name: string }
  access: PersonAccess
  addToId: string | undefined
  viewerIsOwner: boolean
  onClose: () => void
}) {
  const save = useSaveAccess(org.slug)
  const remove = useRemoveFromOrg(org.slug)
  const [draft, setDraft] = useState<AccessDraft>(() => startingDraft(access.draft, addToId))
  // An admin can't change an owner, or remove one.
  const locked = access.draft.orgRole === 'owner' && !viewerIsOwner
  const [removing, setRemoving] = useState(false)
  const person = access.person
  const firstName = person.name.split(' ')[0] ?? person.name

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleChange(next: AccessDraft) {
    save.reset()
    setDraft(next)
  }

  function handleSave() {
    save.mutate(
      { userId: person.id, grant: toAccessGrant(draft, access.projects) },
      { onSuccess: onClose },
    )
  }

  function handleAskRemove() {
    remove.reset()
    setRemoving(true)
  }

  function handleRemoveOpenChange(open: boolean) {
    if (!open) setRemoving(false)
  }

  function handleRemove() {
    remove.mutate(person.id, { onSuccess: onClose })
  }

  const canSave = !locked && !save.isPending
  const removeBody =
    remove.error?.message ??
    `${person.name} loses access to every project in ${org.name} right away. Their work stays.`

  return (
    <>
      <SidePanel
        open
        onOpenChange={handleOpenChange}
        leading={<PersonAvatar person={person} />}
        title={person.name}
        description={`${person.email} · joined ${format(new Date(access.joinedAt), 'd MMM')}`}
        footerStart={
          !locked && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-status-error"
              onClick={handleAskRemove}
            >
              Remove from {org.name}
            </Button>
          )
        }
        actions={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              Save access
            </Button>
          </>
        }
      >
        {locked && <Banner tone="info">Only owners can change an owner’s access.</Banner>}
        {save.error && <Banner tone="warn">{save.error.message}</Banner>}
        <AccessTree
          canMakeOwner={viewerIsOwner}
          personFirstName={firstName}
          orgName={org.name}
          projects={access.projects}
          value={draft}
          onChange={handleChange}
        />
      </SidePanel>
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={handleRemoveOpenChange}
          title={`Remove ${person.name} from ${org.name}?`}
          description={removeBody}
          confirmLabel="Remove"
          onConfirm={handleRemove}
          loading={remove.isPending}
        />
      )}
    </>
  )
}
