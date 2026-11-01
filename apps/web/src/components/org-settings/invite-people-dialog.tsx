import { useState } from 'react'
import { MailPlus } from 'lucide-react'
import { errorFieldOf } from '../../data/dashboard/errors'
import { useSendInvites } from '../../data/dashboard/org-settings'
import { useProjects } from '../../data/dashboard/projects'
import { Button } from '../ui/button'
import { ChipInput } from '../ui/chip-input'
import { FormField } from '../ui/form-field'
import { ModalDialog } from '../ui/modal-dialog'
import { Select } from '../ui/select'
import { Tile } from '../ui/tile'
import { PickedScopes, type PickedScope } from '../shell/picked-scopes'
import { ScopeMultiPicker } from '../shell/scope-multi-picker'
import { scopeOptions, type PickerProject } from '../shell/scope-picks'
import { PROJECT_ROLE_LABEL, WORKSPACE_ROLE_LABEL } from '../access/parts/access-draft'
import { defaultRole, inviteSummary, parseEmails, picksToPlaces } from './invite-form'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
]

const PROJECT_ROLES = (['member', 'admin'] as const).map((role) => ({
  value: role,
  label: PROJECT_ROLE_LABEL[role],
}))

const WORKSPACE_ROLES = (['editor', 'viewer', 'admin'] as const).map((role) => ({
  value: role,
  label: WORKSPACE_ROLE_LABEL[role],
}))

interface InvitePeopleDialogProps {
  org: { slug: string; name: string }
  onClose: () => void
}

/** "Invite people to Acme Inc" (`InvitePeople`): emails, org role, and where members can work. */
export function InvitePeopleDialog({ org, onClose }: InvitePeopleDialogProps) {
  const send = useSendInvites(org.slug)
  const projects = useProjects(org.slug)
  const [emails, setEmails] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [picks, setPicks] = useState<string[]>([])
  const [roles, setRoles] = useState<Record<string, string>>({})

  const pickerProjects: PickerProject[] = (projects.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    meta: `${p.workspaces.length} workspace${p.workspaces.length === 1 ? '' : 's'}`,
    workspaces: p.workspaces.map((w) => ({ id: w.id, name: w.name })),
  }))
  const options = scopeOptions(pickerProjects)
  const picked: PickedScope[] = picks.flatMap((id) => {
    const option = options.find((o) => o.id === id)
    if (!option) return []
    const isProject = option.kind === 'project'
    return [
      {
        id,
        name: option.chip,
        scope: isProject ? 'Project · every workspace' : 'Workspace only',
        role: roles[id] ?? defaultRole(id),
        roles: isProject ? PROJECT_ROLES : WORKSPACE_ROLES,
      },
    ]
  })

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function addEmails(text: string) {
    const parsed = parseEmails(text)
    if (parsed.length === 0) return
    setEmails((current) => [...new Set([...current, ...parsed])])
    setDraft('')
    send.reset()
  }

  function handleRemoveEmail(email: string) {
    setEmails((current) => current.filter((e) => e !== email))
    send.reset()
  }

  function handleRole(value: string) {
    setRole(value as 'member' | 'admin')
  }

  function handleRoleChange(id: string, value: string) {
    setRoles((current) => ({ ...current, [id]: value }))
  }

  function handleSend() {
    const all = [...new Set([...emails, ...parseEmails(draft)])]
    send.mutate(
      { emails: all, role, places: role === 'member' ? picksToPlaces(picks, roles) : [] },
      { onSuccess: onClose },
    )
  }

  const count = new Set([...emails, ...parseEmails(draft)]).size
  const placeLabels = picked.map((p) => {
    const roleLabel = p.roles.find((r) => r.value === p.role)?.label ?? p.role
    return `${p.name} (${roleLabel})`
  })
  const summary = inviteSummary(count, role, placeLabels, org.name)
  const emailError = errorFieldOf(send.error) === 'emails' ? send.error?.message : undefined
  const otherError = send.error && !emailError ? send.error.message : undefined
  const sendLabel = count === 1 ? 'Send 1 invite' : `Send ${count} invites`
  const canSend = count > 0 && !send.isPending
  const footerText = otherError ?? summary

  return (
    <ModalDialog
      open
      onOpenChange={handleOpenChange}
      size="md"
      leading={
        <Tile tone="info" size="lg">
          <MailPlus />
        </Tile>
      }
      title={`Invite people to ${org.name}`}
      description="They get an email with a link to join."
      footerStart={<span className="text-2xs text-muted-foreground">{footerText}</span>}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSend} disabled={!canSend}>
            {sendLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField
          label="Email addresses"
          hint="Separate addresses with commas."
          error={emailError}
        >
          <ChipInput
            values={emails}
            draft={draft}
            onDraftChange={setDraft}
            onCommit={addEmails}
            onRemove={handleRemoveEmail}
            placeholder="Add another"
          />
        </FormField>
        <FormField
          label={`Role in ${org.name}`}
          hint="Admins can open every project. Members can open only what you pick below."
        >
          <Select value={role} onValueChange={handleRole} options={ROLE_OPTIONS} />
        </FormField>
        {role === 'member' ? (
          <div className="flex flex-col gap-2.5">
            <ScopeMultiPicker
              label="Where they can work"
              projects={pickerProjects}
              value={picks}
              onChange={setPicks}
              placeholder="Search projects and workspaces"
              addPlaceholder="Add a project or workspace"
            />
            <PickedScopes
              label="Picked projects and workspaces"
              picks={picked}
              onRoleChange={handleRoleChange}
            />
            <p className="text-2xs text-muted-foreground">
              Choose whole projects or individual workspaces. A project includes all its workspaces.
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            Admins can open every project and workspace in {org.name}, including ones created later.
          </p>
        )}
      </div>
    </ModalDialog>
  )
}
