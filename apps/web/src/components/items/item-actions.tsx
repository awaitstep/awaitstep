import { Plus } from 'lucide-react'
import { useCreateItem } from '../../data/dashboard/items'
import { useEditRequest, useRequestEditAccess } from '../../data/dashboard/requests'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import type { ItemKind } from '../../types/dashboard/items'
import { Button, buttonVariants } from '../ui/button'
import { RequestAction } from '../ui/request-action'
import { RolePill } from '../ui/role-pill'
import { ShellLink } from '../ui/shell-link'
import { ITEM_KIND_LABEL } from './item-kind'

const newLabel = (kind: ItemKind) => `New ${ITEM_KIND_LABEL[kind].toLowerCase()}`

interface NewItemButtonProps {
  slugs: WorkspaceSlugs
  kind: ItemKind
  /** While the list loads the button shows, disabled (`LoadingState`). */
  disabled?: boolean
  /** The phone's short "New". */
  compact?: boolean
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default'
}

/** New workflow / New function: adds a draft at the top of the list (D-P2-1). */
export function NewItemButton({
  slugs,
  kind,
  disabled,
  compact,
  variant = 'default',
  size = 'sm',
}: NewItemButtonProps) {
  const create = useCreateItem(slugs)

  function handleClick() {
    create.mutate({ kind })
  }

  const label = newLabel(kind)
  // A second click while the first is in flight would make a second draft.
  const busy = disabled || create.isPending
  const accessibleName = compact ? label : undefined
  const text = compact ? 'New' : label
  const icon = variant === 'default' ? <Plus aria-hidden="true" /> : null

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={busy}
        aria-label={accessibleName}
      >
        {icon}
        {text}
      </Button>
      {create.error && (
        <span role="alert" className="text-2xs text-status-error">
          {create.error.message}
        </span>
      )}
    </>
  )
}

interface EditAccessRequestProps {
  slugs: WorkspaceSlugs
}

/** A Viewer's "Viewer" pill and Ask for edit access → "Asked Ama Mensah" (`ViewerWorkflows`). */
export function EditAccessRequest({ slugs }: EditAccessRequestProps) {
  const request = useEditRequest(slugs)
  const ask = useRequestEditAccess(slugs)
  const sent = request.data ?? ask.data ?? null
  const sentLabel = sent ? `Asked ${sent.to.name}` : 'Asked'

  function handleRequest() {
    ask.mutate()
  }

  return (
    <>
      <RolePill role="viewer" />
      <RequestAction
        label="Ask for edit access"
        sentLabel={sentLabel}
        requested={sent !== null}
        onRequest={handleRequest}
      />
    </>
  )
}

interface ItemActionsProps {
  slugs: WorkspaceSlugs
  kind: ItemKind
  readOnly: boolean
  loading: boolean
}

/** The top bar of Workflows and Functions: Import + New, or a Viewer's request. */
export function ItemActions({ slugs, kind, readOnly, loading }: ItemActionsProps) {
  if (readOnly) return <EditAccessRequest slugs={slugs} />
  const importHref = `${workspacePath(slugs, 'workflows')}?new=import`
  return (
    <>
      {kind === 'workflow' && !loading && (
        <ShellLink href={importHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          Import
        </ShellLink>
      )}
      <NewItemButton slugs={slugs} kind={kind} disabled={loading} />
    </>
  )
}
