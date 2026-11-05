import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { basename, dirname } from '../../lib/ide/file-tree'
import type { SearchHit, SearchResults } from '../../lib/ide/search'
import { flattenResults, resultKeyIntent, type ResultRow } from '../../lib/ide/search-results'
import { cn } from '../../lib/utils'

interface SearchResultsListProps {
  results: SearchResults
  /** Key of the hit last opened, for the selected look. */
  currentKey: string | null
  onOpenHit: (path: string, hit: SearchHit) => void
  /** ↑ from the first row: back to the search box. */
  onFocusInput: () => void
  onEscape: () => void
}

/** Matches grouped by file; arrows, Enter and Esc as in the file tree. */
export function SearchResultsList({
  results,
  currentKey,
  onOpenHit,
  onFocusInput,
  onEscape,
}: SearchResultsListProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => flattenResults(results, collapsed), [results, collapsed])
  // Your files, then generated ones: each a labelled group inside the tree.
  const groups = useMemo(() => {
    return [false, true]
      .map((generated) => ({
        generated,
        hits: results.files
          .filter((f) => f.generated === generated)
          .reduce((sum, f) => sum + f.hits.length, 0),
        rows: rows.filter((r) => r.generated === generated),
      }))
      .filter((group) => group.rows.length > 0)
  }, [results, rows])
  const hasGenerated = results.files.some((f) => f.generated)
  const tabKey = rows.some((r) => r.key === focusedKey) ? focusedKey : (rows[0]?.key ?? null)

  function focusRow(key: string) {
    const nodes = listRef.current?.querySelectorAll<HTMLElement>('[data-row-key]') ?? []
    for (const node of nodes) {
      if (node.dataset.rowKey === key) {
        node.focus()
        return
      }
    }
  }

  function setFolded(path: string, folded: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (folded) next.add(path)
      else next.delete(path)
      return next
    })
  }

  function activate(row: ResultRow) {
    if (row.kind === 'hit') onOpenHit(row.path, row.hit)
    else setFolded(row.path, row.expanded)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = (event.target as HTMLElement).dataset.rowKey
    if (!key) return
    const intent = resultKeyIntent(rows, key, event)
    if (!intent) return
    event.preventDefault()
    switch (intent.type) {
      case 'focus':
        setFocusedKey(intent.key)
        return focusRow(intent.key)
      case 'collapse':
        return setFolded(intent.path, true)
      case 'expand':
        return setFolded(intent.path, false)
      case 'open': {
        const row = rows.find((r) => r.key === intent.key)
        if (row) activate(row)
        return
      }
      case 'input':
        return onFocusInput()
      case 'escape':
        return onEscape()
    }
  }

  function handleFocusRow(key: string) {
    setFocusedKey(key)
  }

  return (
    <div
      ref={listRef}
      role="tree"
      aria-label="Search results"
      onKeyDown={handleKeyDown}
      className="min-h-0 flex-1 overflow-auto pb-2"
    >
      {groups.map((group) => (
        <div
          key={group.generated ? 'generated' : 'yours'}
          role="group"
          aria-label={group.generated ? 'Generated files, read-only' : 'Your files'}
        >
          {hasGenerated && <SectionHeading generated={group.generated} hits={group.hits} />}
          {group.rows.map((row) => (
            <ResultRowView
              key={row.key}
              row={row}
              tabbable={row.key === tabKey}
              current={row.key === currentKey}
              onActivate={activate}
              onFocusRow={handleFocusRow}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function SectionHeading({ generated, hits }: { generated: boolean; hits: number }) {
  // The group carries the name for assistive tech; the heading is for the eye.
  return (
    <div
      aria-hidden="true"
      className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {generated ? 'Generated · read-only' : 'Your files'} · {hits}
    </div>
  )
}

interface ResultRowViewProps {
  row: ResultRow
  tabbable: boolean
  current: boolean
  onActivate: (row: ResultRow) => void
  onFocusRow: (key: string) => void
}

function ResultRowView({ row, tabbable, current, onActivate, onFocusRow }: ResultRowViewProps) {
  function handleClick() {
    onActivate(row)
  }

  function handleFocus() {
    onFocusRow(row.key)
  }

  const common = {
    role: 'treeitem' as const,
    tabIndex: tabbable ? 0 : -1,
    'data-row-key': row.key,
    onClick: handleClick,
    onFocus: handleFocus,
  }

  if (row.kind === 'file') {
    const Chevron = row.expanded ? ChevronDown : ChevronRight
    const folder = dirname(row.path)
    return (
      <div
        {...common}
        aria-expanded={row.expanded}
        title={row.path}
        className="flex h-6 cursor-pointer items-center gap-1 px-2 text-xs outline-none hover:bg-muted/50 focus-visible:bg-muted/70"
      >
        <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{basename(row.path)}</span>
        {folder && <span className="truncate text-muted-foreground">{folder}</span>}
        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {row.count}
        </span>
      </div>
    )
  }

  return (
    <div
      {...common}
      aria-selected={current}
      title={`${row.path}:${row.hit.line}`}
      className={cn(
        'flex h-6 cursor-pointer items-center gap-2 pl-7 pr-2 text-xs outline-none hover:bg-muted/50 focus-visible:bg-muted/70',
        current && 'bg-primary/10',
      )}
    >
      <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
        {row.hit.line}
      </span>
      <HitText hit={row.hit} />
    </div>
  )
}

function HitText({ hit }: { hit: SearchHit }) {
  // Kept inside the text however the hit was built.
  const start = Math.min(Math.max(hit.matchStart, 0), hit.text.length)
  const end = Math.min(Math.max(hit.matchEnd, start), hit.text.length)
  return (
    <span className="truncate whitespace-pre font-mono text-[11px] text-foreground/80">
      {hit.text.slice(0, start)}
      <mark className="rounded-sm bg-primary/25 text-foreground">{hit.text.slice(start, end)}</mark>
      {hit.text.slice(end)}
    </span>
  )
}
