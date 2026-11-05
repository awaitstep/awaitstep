import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  browserDraftStorage,
  loadDrafts,
  mergeRestoredDrafts,
  saveDrafts,
} from '../lib/ide/draft-persistence'
import { useAuthStore } from '../stores/auth-store'
import { useIdeStore } from '../stores/ide-store'

const WRITE_DELAY_MS = 400

interface DraftPersistenceInput {
  workflowId: string
  /**
   * Only the current, editable version persists. An older version is
   * read-only and never restores or writes drafts.
   */
  enabled: boolean
  /** The loaded files; restoring waits for them to compare against. */
  baseline: ReadonlyMap<string, { source: string; hash?: string | undefined }> | null
}

/**
 * Keeps unsaved edits across a reload: restores them once the source has
 * loaded (with a banner), then mirrors every later change into IndexedDB.
 *
 * Keep this hook's call above the effect that resets the session on unmount:
 * its cleanup must unsubscribe first, or the reset's empty drafts would be
 * written over what the next visit should restore.
 *
 * Effects are the right tool here: the stored drafts arrive asynchronously
 * from the browser, and the mirror is a subscription to the store.
 */
export function useDraftPersistence({ workflowId, enabled, baseline }: DraftPersistenceInput) {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const active = enabled && userId !== null

  const stored = useQuery({
    queryKey: ['ide-stored-drafts', userId, workflowId],
    queryFn: () => loadDrafts(browserDraftStorage, userId!, workflowId, Date.now()),
    enabled: active,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })

  // Writes stay off until the restore has run: the first, empty store state
  // would otherwise erase exactly what we are about to bring back.
  // Remembered per user: if the signed-in account changes while the workspace
  // stays open, the edits in memory belong to the previous account and must
  // never be written under the new one.
  const [restoredFor, setRestoredFor] = useState<string | null>(null)
  const restoredRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active || !baseline) return
    if (restoredRef.current === userId) return
    const store = useIdeStore.getState()
    if (restoredRef.current !== null) {
      store.clearDrafts()
      store.setRestoreNotice(null)
      restoredRef.current = null
      setRestoredFor(null)
    }
    if (stored.isPending && !stored.isError) return
    restoredRef.current = userId
    if (stored.data) {
      const result = mergeRestoredDrafts(stored.data, baseline)
      const paths = Object.keys(result.drafts)
      if (paths.length > 0) {
        store.replaceDrafts({ ...result.drafts, ...store.drafts })
        store.setRestoreNotice({
          paths,
          changedOnServer: result.changedOnServer,
          deleted: result.deleted,
        })
      }
    }
    setRestoredFor(userId)
  }, [active, baseline, userId, stored.isPending, stored.isError, stored.data])

  useEffect(() => {
    if (!active || restoredFor !== userId) return
    let timer: ReturnType<typeof setTimeout> | null = null

    function write() {
      timer = null
      // Storage can be blocked (private windows); losing persistence must
      // never break editing.
      saveDrafts(
        browserDraftStorage,
        userId!,
        workflowId,
        useIdeStore.getState().drafts,
        Date.now(),
      ).catch(() => undefined)
    }

    function schedule() {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(write, WRITE_DELAY_MS)
    }

    function flush() {
      if (timer === null) return
      clearTimeout(timer)
      write()
    }

    write()
    const unsubscribe = useIdeStore.subscribe((state, previous) => {
      if (state.drafts !== previous.drafts) schedule()
    })
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [active, restoredFor, userId, workflowId])
}
