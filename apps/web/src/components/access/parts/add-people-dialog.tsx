import { useState, type ReactNode } from 'react'
import { Check, Info, X } from 'lucide-react'
import type { AddPeopleOutcome } from '../../../types/dashboard/access'
import { Avatar } from '../../ui/avatar'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../ui/dialog'
import {
  doneCopy,
  doneLine,
  pickKey,
  pickName,
  submitLabel,
  summaryText,
  type AddPeopleContext,
  type Pick,
} from './add-people-copy'
import { PeoplePicker } from './people-picker'
import type { PoolPerson } from './people-pool'

/** One dialog's worth: each pick is its own request, under the API's per-minute write limit. */
export const MAX_PICKS = 20

const OUTCOME_BADGE = {
  added: { variant: 'success', label: 'Added' },
  invited: { variant: 'warning', label: 'Pending' },
  failed: { variant: 'error', label: 'Not added' },
} as const

interface DoneListProps {
  picks: Pick[]
  outcomes: AddPeopleOutcome[]
  ctx: AddPeopleContext
}

function DoneList({ picks, outcomes, ctx }: DoneListProps) {
  const byKey = new Map(picks.map((pick) => [pickKey(pick), pick]))
  return (
    <ul
      aria-label="Who was added"
      className="flex flex-col divide-y divide-border border-y border-border"
    >
      {outcomes.map((outcome) => {
        const pick = byKey.get(outcome.key)
        const name = pick ? pickName(pick) : outcome.key
        const badge = OUTCOME_BADGE[outcome.result]
        return (
          <li key={outcome.key} className="flex items-center gap-3 py-3">
            <Avatar
              name={pick?.kind === 'person' ? pick.entry.person.name : null}
              email={pick?.kind === 'person' ? pick.entry.person.email : outcome.key}
              className="size-[30px] text-2xs"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{name}</span>{' '}
              <span className="text-2xs text-muted-foreground">{doneLine(outcome, ctx)}</span>
            </span>
            <Badge variant={badge.variant} className="font-normal whitespace-nowrap">
              {badge.label}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}

interface AddPeopleDialogProps {
  title: string
  description: string
  searchLabel: string
  pool: PoolPerson[]
  /** Whether a new address can be invited from here. */
  canInvite: boolean
  /** The people lists are still loading, or failed (with a way to try again). */
  poolState?: { status: 'loading' } | { status: 'error'; onRetry: () => void }
  /** The role (and, for a project, which workspaces) section between the picker and the note. */
  access: ReactNode
  /** Something the access section still needs before adding: no workspace picked. */
  accessIncomplete?: boolean
  ctx: AddPeopleContext
  pending: boolean
  /** How each pick went, once added: the done state. */
  outcomes: AddPeopleOutcome[] | undefined
  onSubmit: (picks: Pick[]) => void
  /** "Add more": back to picking, the last result forgotten. */
  onReset: () => void
  onClose: () => void
}

/**
 * The Add people dialog's frame (`AddToProject`, `AddToWorkspace`): pick
 * people or type an email, choose what they get, read what will happen, add;
 * then who was added, who was invited and who wasn't.
 */
export function AddPeopleDialog({
  title,
  description,
  searchLabel,
  pool,
  canInvite,
  poolState,
  access,
  accessIncomplete = false,
  ctx,
  pending,
  outcomes,
  onSubmit,
  onReset,
  onClose,
}: AddPeopleDialogProps) {
  const [picks, setPicks] = useState<Pick[]>([])
  const [query, setQuery] = useState('')

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleToggle(entry: PoolPerson) {
    setPicks((current) => {
      if (current.some((p) => pickKey(p) === entry.person.id)) {
        return current.filter((p) => pickKey(p) !== entry.person.id)
      }
      return current.length < MAX_PICKS ? [...current, { kind: 'person', entry }] : current
    })
  }

  function handleInvite(email: string) {
    // At the cap the address stays typed, so nothing vanishes without being added.
    if (picks.length >= MAX_PICKS) return
    setPicks([...picks, { kind: 'email', email }])
    setQuery('')
  }

  function handleRemove(key: string) {
    setPicks((current) => current.filter((p) => pickKey(p) !== key))
  }

  function handleSubmit() {
    onSubmit(picks)
  }

  function handleAgain() {
    setPicks([])
    setQuery('')
    onReset()
  }

  const canAdd = picks.length > 0 && !accessIncomplete && !pending
  const done = outcomes ? doneCopy(outcomes, ctx) : null

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        layout="sectioned"
        size="lg"
        // The board opens it near the top, so the list can grow without the dialog jumping.
        className="top-16 translate-y-0 rounded-[18px] data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-6 pt-[22px] pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="text-base font-semibold tracking-normal">{title}</DialogTitle>
            <DialogDescription className="text-sm">{description}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-[30px] shrink-0 text-muted-foreground"
              aria-label="Close"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {done && outcomes ? (
            <div className="flex flex-col gap-4 px-6 pt-[26px] pb-2">
              <span className="flex size-[46px] items-center justify-center rounded-[13px] bg-tone-ok text-status-success">
                <Check className="size-[22px]" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-semibold text-foreground">{done.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{done.body}</p>
              </div>
              <DoneList picks={picks} outcomes={outcomes} ctx={ctx} />
            </div>
          ) : (
            <>
              <PeoplePicker
                pool={pool}
                picks={picks}
                query={query}
                onQuery={setQuery}
                onToggle={handleToggle}
                onInvite={handleInvite}
                onRemove={handleRemove}
                searchLabel={searchLabel}
                orgName={ctx.orgName}
                canInvite={canInvite}
                poolState={poolState}
              />
              <div className="mt-3 border-t border-border px-6 pt-3.5">{access}</div>
              <p className="mx-6 mt-3.5 mb-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{summaryText(picks, ctx)}</span>
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 border-t border-border bg-background/50 px-6 py-4">
          {done ? (
            <>
              <Button type="button" variant="outline" onClick={handleAgain} className="ml-auto">
                Add more
              </Button>
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-xs text-muted-foreground">
                {picks.length > 0 && `${picks.length} selected`}
                {picks.length >= MAX_PICKS && ` · ${MAX_PICKS} at a time`}
              </span>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={!canAdd}>
                {submitLabel(picks)}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
