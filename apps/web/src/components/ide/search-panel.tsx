import { useEffect, useMemo, useRef } from 'react'
import type { GeneratedFile } from '@awaitstep/codegen'
import { useShallow } from 'zustand/react/shallow'
import {
  MAX_SEARCH_HITS,
  buildSearchPattern,
  formatHitCount,
  type SearchHit,
  type SearchOutcome,
} from '../../lib/ide/search'
import { openSearchHit } from '../../lib/ide/search-actions'
import { hitKey } from '../../lib/ide/search-results'
import { useIdeSearchStore } from '../../stores/ide-search-store'
import { SearchBox } from './search-box'
import { SearchResultsList } from './search-results-list'
import { SideBarTabs } from './side-bar-tabs'

interface SearchPanelProps {
  files: ReadonlyMap<string, GeneratedFile>
  /** The Search tab is showing; the box takes focus only then. */
  active: boolean
  onEscape: () => void
}

/**
 * The side bar's Search view. It shows what `SearchRunner` found over every
 * file as the editor has it, unsaved text included.
 */
export function SearchPanel({ files, active, onEscape }: SearchPanelProps) {
  const {
    query,
    caseSensitive,
    wholeWord,
    regex,
    includeGenerated,
    focusRequested,
    status,
    outcome,
    current,
  } = useIdeSearchStore(
    useShallow((s) => ({
      query: s.query,
      caseSensitive: s.caseSensitive,
      wholeWord: s.wholeWord,
      regex: s.regex,
      includeGenerated: s.includeGenerated,
      focusRequested: s.focusRequested,
      status: s.status,
      outcome: s.outcome,
      current: s.current,
    })),
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // A pattern that does not parse is reported as typed, not after the pause.
  const parseError = useMemo(() => {
    const built = buildSearchPattern({ query, caseSensitive, wholeWord, regex })
    return built && 'error' in built ? built.error : null
  }, [query, caseSensitive, wholeWord, regex])
  const shown: SearchOutcome | null =
    query === '' ? null : parseError ? { kind: 'invalid', message: parseError } : outcome

  // Focus is a DOM side effect, so it waits for the box to be on screen.
  useEffect(() => {
    if (!focusRequested || !active) return
    inputRef.current?.focus()
    inputRef.current?.select()
    useIdeSearchStore.getState().consumeFocus()
  }, [focusRequested, active])

  function focusFirstResult() {
    panelRef.current?.querySelector<HTMLElement>('[data-row-key][tabindex="0"]')?.focus()
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      focusFirstResult()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onEscape()
    }
  }

  function handleFocusInput() {
    inputRef.current?.focus()
  }

  function handleIncludeGenerated() {
    useIdeSearchStore.getState().toggle('includeGenerated')
  }

  // A hit can outlive its file for a moment (the next search is still
  // running); opening it would add a tab for a file that is gone.
  function handleOpenHit(path: string, hit: SearchHit) {
    if (files.has(path)) openSearchHit(path, hit)
  }

  const results = shown?.kind === 'results' ? shown.results : null
  const searching = status === 'searching' && query !== ''
  return (
    <div ref={panelRef} className="flex h-full flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <SideBarTabs view="search" />
      </div>
      <SearchBox
        inputRef={inputRef}
        onKeyDown={handleInputKeyDown}
        invalid={shown?.kind === 'invalid'}
      />
      <div role="status" aria-live="polite" className="shrink-0 px-3 py-1.5 text-[11px]">
        <Summary outcome={shown} searching={searching} includeGenerated={includeGenerated} />
      </div>
      {shown?.kind === 'results' && shown.results.total === 0 && !includeGenerated && (
        <div className="shrink-0 px-3 pb-1.5 text-[11px] text-muted-foreground">
          <p>
            Generated files weren’t searched.{' '}
            <button
              type="button"
              onClick={handleIncludeGenerated}
              className="text-primary underline-offset-2 hover:underline"
            >
              Include generated files
            </button>
          </p>
        </div>
      )}
      {results && results.total > 0 && (
        <SearchResultsList
          // New terms start with every file unfolded again.
          key={`${query}\0${caseSensitive}\0${wholeWord}\0${regex}\0${includeGenerated}`}
          results={results}
          onOpenHit={handleOpenHit}
          currentKey={current ? hitKey(current) : null}
          onFocusInput={handleFocusInput}
          onEscape={onEscape}
        />
      )}
    </div>
  )
}

function Summary({
  outcome,
  searching,
  includeGenerated,
}: {
  outcome: SearchOutcome | null
  searching: boolean
  includeGenerated: boolean
}) {
  function handleRetry() {
    useIdeSearchStore.getState().retry()
  }
  if (outcome === null) {
    return (
      <p className="text-muted-foreground">
        {searching ? 'Searching…' : 'Searches your project files, unsaved changes included.'}
      </p>
    )
  }
  if (outcome.kind === 'invalid') return <p className="text-destructive">{outcome.message}</p>
  if (outcome.kind === 'timeout') {
    return (
      <p className="text-destructive">
        Search took too long and was stopped. Simplify the pattern, or{' '}
        <button
          type="button"
          onClick={handleRetry}
          className="underline underline-offset-2 hover:no-underline"
        >
          retry
        </button>
        .
      </p>
    )
  }
  if (outcome.kind === 'failed') {
    return <p className="text-destructive">Search failed. Try again.</p>
  }
  const { total, capped, files } = outcome.results
  if (total === 0) {
    return (
      <p className="text-muted-foreground">
        {includeGenerated ? 'No results.' : 'No results in your files.'}
      </p>
    )
  }
  const hits = `${formatHitCount(total, capped)} ${total === 1 && !capped ? 'result' : 'results'}`
  return (
    <div className="space-y-1 text-muted-foreground">
      <p>{capped ? hits : `${hits} in ${files.length} ${files.length === 1 ? 'file' : 'files'}`}</p>
      {capped && (
        <p>Showing the first {MAX_SEARCH_HITS.toLocaleString('en-US')}. Narrow the search.</p>
      )}
    </div>
  )
}
