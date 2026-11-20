import { HeaderButton } from './diff-parts'

/** One pending change as Unsaved changes lists it. */
export interface PendingChangeEntry {
  id: string
  label: string
  /** In a post in flight: it can't be discarded until that settles. */
  locked?: boolean
}

interface PendingChangesProps {
  /** The list's heading: Graph, Files. */
  title: string
  /** Its accessible name: "Graph changes", "File changes". */
  label: string
  entries: readonly PendingChangeEntry[]
  canEdit: boolean
  busy: boolean
  onDiscard: (id: string) => void
}

/**
 * A list of Unsaved changes that aren't file text — graph edits, new,
 * renamed and deleted files — each in plain words, oldest first, with a
 * Discard that drops only it.
 */
export function PendingChanges({
  title,
  label,
  entries,
  canEdit,
  busy,
  onDiscard,
}: PendingChangesProps) {
  if (entries.length === 0) return null
  return (
    <section aria-label={label} className="shrink-0 border-b border-border bg-card">
      <h2 className="px-3 pt-2 text-xs font-medium text-muted-foreground">{title}</h2>
      <ul className="flex flex-col py-1">
        {entries.map((entry) => (
          <PendingChangeRow
            key={entry.id}
            entry={entry}
            disabled={!canEdit || busy || entry.locked === true}
            onDiscard={onDiscard}
          />
        ))}
      </ul>
    </section>
  )
}

function PendingChangeRow({
  entry,
  disabled,
  onDiscard,
}: {
  entry: PendingChangeEntry
  disabled: boolean
  onDiscard: (id: string) => void
}) {
  function handleDiscard() {
    onDiscard(entry.id)
  }

  return (
    <li className="flex items-center gap-2 px-3 py-0.5 text-xs">
      <span className="min-w-0 flex-1 truncate text-foreground" title={entry.label}>
        {entry.label}
      </span>
      <HeaderButton
        onClick={handleDiscard}
        disabled={disabled}
        aria-label={`Discard: ${entry.label}`}
      >
        Discard
      </HeaderButton>
    </li>
  )
}
