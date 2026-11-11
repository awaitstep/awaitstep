import { Check, Mail, Search, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { Avatar } from '../../ui/avatar'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { pickKey, pickName, type Pick } from './add-people-copy'
import { inviteCandidate, matchPool, type PoolPerson } from './people-pool'

interface PickChipProps {
  pick: Pick
  onRemove: (key: string) => void
}

function PickChip({ pick, onRemove }: PickChipProps) {
  const name = pickName(pick)
  const label = pick.kind === 'person' ? name.split(' ')[0] : name

  function handleRemove() {
    onRemove(pickKey(pick))
  }

  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted pr-1.5 pl-0.5">
      <Avatar
        name={pick.kind === 'person' ? pick.entry.person.name : null}
        email={pick.kind === 'person' ? pick.entry.person.email : pick.email}
        src={pick.kind === 'person' ? pick.entry.person.image : null}
        className="size-[22px] text-3xs"
      />
      <span className="text-xs text-foreground">{label}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={handleRemove}
        className="flex size-[18px] items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}

interface ResultRowProps {
  entry: PoolPerson
  selected: boolean
  onToggle: (entry: PoolPerson) => void
}

function ResultRow({ entry, selected, onToggle }: ResultRowProps) {
  const off = entry.tier === 'has'

  function handleClick() {
    if (!off) onToggle(entry)
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={off}
      onClick={handleClick}
      className={cn(
        'mb-0.5 flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left',
        selected && 'bg-muted',
        off ? 'cursor-not-allowed opacity-55' : 'hover:bg-muted/60',
      )}
    >
      <Avatar
        name={entry.person.name}
        email={entry.person.email}
        src={entry.person.image}
        className={cn('size-8 text-xs', off && 'opacity-45')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">
          {entry.person.name || entry.person.email}
        </span>{' '}
        <span className="truncate text-2xs text-muted-foreground">{entry.note}</span>
      </span>
      {entry.joins && (
        <Badge variant="warning" className="font-normal whitespace-nowrap">
          Joins the project too
        </Badge>
      )}
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md',
          selected ? 'bg-primary text-primary-foreground' : 'border border-border text-transparent',
        )}
      >
        <Check className="size-3.5" />
      </span>
    </button>
  )
}

interface PeoplePickerProps {
  /** Everyone who can be shown, from `workspacePool` or `projectPool`. */
  pool: PoolPerson[]
  picks: Pick[]
  query: string
  onQuery: (query: string) => void
  onToggle: (entry: PoolPerson) => void
  onInvite: (email: string) => void
  onRemove: (key: string) => void
  /** "Search Project 101 and Acme Inc, or type an email". */
  searchLabel: string
  orgName: string
  /** Whether a typed address can be invited; without it the picker only adds org members. */
  canInvite: boolean
  /** The people lists are still loading, or failed: said so, never "Nobody matches". */
  poolState?: { status: 'loading' } | { status: 'error'; onRetry: () => void }
}

/**
 * The Add people picker (21a, 21b): a search field holding the picks as
 * chips, the people it matches, and "Invite {email}" for a new address.
 */
export function PeoplePicker({
  pool,
  picks,
  query,
  onQuery,
  onToggle,
  onInvite,
  onRemove,
  searchLabel,
  orgName,
  canInvite,
  poolState,
}: PeoplePickerProps) {
  const results = matchPool(pool, query)
  const pickedIds = new Set(picks.map(pickKey))
  const pickedEmails = picks.flatMap((p) => (p.kind === 'email' ? [p.email] : []))
  const invite = canInvite ? inviteCandidate(query, pool, pickedEmails) : null

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    onQuery(event.target.value)
  }

  function handleInvite() {
    if (invite) onInvite(invite)
  }

  return (
    <>
      <div className="mx-6 mt-4 flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[9px] border border-border bg-card px-3 py-[3px] focus-within:border-primary/60">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {picks.map((pick) => (
          <PickChip key={pickKey(pick)} pick={pick} onRemove={onRemove} />
        ))}
        <input
          type="search"
          value={query}
          onChange={handleInput}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="h-7 min-w-[180px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <div className="mx-3 max-h-[244px] overflow-y-auto px-3 pt-2 pb-1">
        <div role="listbox" aria-label="People" aria-multiselectable>
          {results.map((entry) => (
            <ResultRow
              key={entry.person.id}
              entry={entry}
              selected={pickedIds.has(entry.person.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
        {invite && (
          <button
            type="button"
            onClick={handleInvite}
            className="mt-1 flex w-full items-center gap-3 rounded-[10px] border border-dashed border-border px-2.5 py-2.5 text-left hover:bg-muted/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-ok text-status-success">
              <Mail className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium [overflow-wrap:anywhere] text-foreground">
                Invite {invite}
              </span>{' '}
              <span className="text-2xs text-muted-foreground">
                Not in {orgName} yet. They’ll get an email invite.
              </span>
            </span>
          </button>
        )}
        {poolState?.status === 'loading' && (
          <p role="status" className="mx-1 my-3.5 text-xs text-muted-foreground">
            Loading people…
          </p>
        )}
        {poolState?.status === 'error' && (
          <p role="alert" className="mx-1 my-3.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-status-error">We couldn’t load the people to pick from.</span>
            <Button type="button" variant="outline" size="sm" onClick={poolState.onRetry}>
              Try again
            </Button>
          </p>
        )}
        {!poolState && results.length === 0 && !invite && (
          <p className="mx-1 my-3.5 text-xs text-muted-foreground">
            {canInvite
              ? 'Nobody matches that. Type a full email address to invite someone new.'
              : 'Nobody matches that.'}
          </p>
        )}
      </div>
    </>
  )
}
