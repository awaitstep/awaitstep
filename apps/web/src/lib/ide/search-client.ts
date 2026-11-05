import type { SearchFile, SearchOptions, SearchOutcome } from './search'

export interface SearchRequest {
  id: number
  filesId: number
  /** Present only when the worker does not hold this file set yet. */
  files?: readonly SearchFile[]
  options: SearchOptions
}

export interface SearchReply {
  id: number
  outcome: SearchOutcome | { kind: 'stale' }
}

/** The slice of `Worker` the client uses, so tests can stand in for it. */
export interface SearchWorkerLike {
  postMessage(message: SearchRequest): void
  terminate(): void
  onmessage: ((event: { data: SearchReply }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface SearchClient {
  /**
   * Resolves with the outcome, or null when a newer search (or `dispose`)
   * made this one irrelevant. Only the newest search ever reports.
   */
  search(files: readonly SearchFile[], options: SearchOptions): Promise<SearchOutcome | null>
  dispose(): void
}

/** How long a search may run before its worker is stopped. */
export const SEARCH_TIMEOUT_MS = 2000

interface Pending {
  id: number
  resolve: (outcome: SearchOutcome | null) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Talks to one search worker at a time. JavaScript cannot interrupt a regex
 * that is running, so the only way out of a runaway pattern is to stop the
 * worker: a new query while one is running, or two seconds, replaces it with
 * a fresh one. A worker that is idle is reused, and keeps the files it was
 * sent, so a new query over the same files posts only the query.
 */
export function createSearchClient(
  createWorker: () => SearchWorkerLike,
  timeoutMs = SEARCH_TIMEOUT_MS,
): SearchClient {
  let worker: SearchWorkerLike | null = null
  let pending: Pending | null = null
  let nextId = 0
  let sentFiles: readonly SearchFile[] | null = null
  let filesId = 0

  function stopWorker() {
    worker?.terminate()
    worker = null
    sentFiles = null
  }

  function settle(outcome: SearchOutcome | null) {
    const current = pending
    if (!current) return
    pending = null
    clearTimeout(current.timer)
    current.resolve(outcome)
  }

  function start(): SearchWorkerLike {
    const created = createWorker()
    created.onmessage = (event) => {
      if (event.data.id !== pending?.id) return
      if (event.data.outcome.kind === 'stale') {
        // Cannot happen while the client's bookkeeping holds; if it does,
        // starting over is cheaper than a wrong answer.
        stopWorker()
        settle(null)
        return
      }
      settle(event.data.outcome)
    }
    // The worker could not load or crashed: a failure, not a slow pattern.
    created.onerror = () => {
      stopWorker()
      settle({ kind: 'failed' })
    }
    return created
  }

  return {
    search(files, options) {
      // A search still running is superseded; its worker may be stuck.
      if (pending) {
        stopWorker()
        settle(null)
      }
      worker ??= start()
      const id = ++nextId
      if (sentFiles !== files) filesId++
      const request: SearchRequest = {
        id,
        filesId,
        options,
        ...(sentFiles !== files && { files }),
      }
      sentFiles = files
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (pending?.id !== id) return
          stopWorker()
          settle({ kind: 'timeout' })
        }, timeoutMs)
        pending = { id, resolve, timer }
        worker!.postMessage(request)
      })
    },
    dispose() {
      stopWorker()
      settle(null)
    },
  }
}

/** The production worker: a plain module worker, created in the browser only. */
export function createBrowserSearchWorker(): SearchWorkerLike {
  return new Worker(new URL('./search-worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as SearchWorkerLike
}
