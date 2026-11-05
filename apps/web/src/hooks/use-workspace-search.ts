import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildSearchPattern, type SearchFile, type SearchOptions } from '../lib/ide/search'
import {
  createBrowserSearchWorker,
  createSearchClient,
  type SearchWorkerLike,
} from '../lib/ide/search-client'
import { useIdeSearchStore } from '../stores/ide-search-store'
import { useDebouncedValue } from './use-debounced-value'

/** Typing and drafts settle this long before the files are searched again. */
export const SEARCH_DEBOUNCE_MS = 200

/**
 * Keeps the search store's outcome in step with the query and the files:
 * a pause after typing, or after a draft changes, searches again. It runs
 * whether or not the Search tab is showing, so F4 never steps through results
 * from before your last edit. The search runs in a worker and the pause is a
 * timer; both are effects for the one reason effects exist — they talk to
 * something outside React and must be stopped when the query moves on.
 */
export function useWorkspaceSearch(
  files: readonly SearchFile[],
  createWorker: () => SearchWorkerLike = createBrowserSearchWorker,
): void {
  const { query, caseSensitive, wholeWord, regex, retryCount } = useIdeSearchStore(
    useShallow((s) => ({
      query: s.query,
      caseSensitive: s.caseSensitive,
      wholeWord: s.wholeWord,
      regex: s.regex,
      retryCount: s.retryCount,
    })),
  )
  const request = useMemo(() => {
    const options: SearchOptions = { query, caseSensitive, wholeWord, regex }
    return { files, options }
  }, [files, query, caseSensitive, wholeWord, regex])
  const settled = useDebouncedValue(request, SEARCH_DEBOUNCE_MS)
  // The worker is created on first use, in the browser only.
  const [client] = useState(() => createSearchClient(createWorker))

  useEffect(() => client.dispose, [client])

  // A pattern that timed out is not run again on every edit: it waits for a
  // change of query or options, or for Retry.
  const timedOut = useRef<{ key: string; retryCount: number } | null>(null)

  useEffect(() => {
    const store = useIdeSearchStore.getState()
    const built = buildSearchPattern(settled.options)
    if (built === null) {
      client.dispose()
      if (store.outcome !== null) store.setOutcome(null)
      return
    }
    if ('error' in built) {
      client.dispose()
      store.setOutcome({ kind: 'invalid', message: built.error })
      return
    }
    const key = JSON.stringify(settled.options)
    const blocked = timedOut.current
    if (blocked && blocked.key === key && blocked.retryCount === retryCount) return
    timedOut.current = null
    let current = true
    store.setSearching()
    void client.search(settled.files, settled.options).then((outcome) => {
      if (!current || !outcome) return
      if (outcome.kind === 'timeout') timedOut.current = { key, retryCount }
      useIdeSearchStore.getState().setOutcome(outcome)
    })
    return () => {
      current = false
    }
  }, [client, settled, retryCount])
}
