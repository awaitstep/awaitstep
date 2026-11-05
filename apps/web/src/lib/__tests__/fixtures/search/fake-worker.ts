import { runSearch } from '../../../ide/search'
import type { SearchReply, SearchRequest, SearchWorkerLike } from '../../../ide/search-client'

/**
 * A stand-in for the search Worker. It runs the real search, either at once
 * (`respond: 'sync'`) or never (`'hang'`, a runaway regex), and records what
 * it was sent so tests can see which messages carried files.
 */
export class FakeSearchWorker implements SearchWorkerLike {
  static created: FakeSearchWorker[] = []
  static respond: 'sync' | 'hang' = 'sync'

  onmessage: ((event: { data: SearchReply }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminated = false
  received: SearchRequest[] = []
  private files: SearchRequest['files'] = []
  private filesId = -1

  constructor() {
    FakeSearchWorker.created.push(this)
  }

  static reset(respond: 'sync' | 'hang' = 'sync') {
    FakeSearchWorker.created = []
    FakeSearchWorker.respond = respond
  }

  postMessage(request: SearchRequest) {
    this.received.push(request)
    if (request.files) {
      this.files = request.files
      this.filesId = request.filesId
    }
    if (FakeSearchWorker.respond === 'hang') return
    const outcome =
      this.filesId === request.filesId
        ? runSearch(this.files ?? [], request.options)
        : ({ kind: 'stale' } as const)
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data: { id: request.id, outcome } })
    })
  }

  terminate() {
    this.terminated = true
  }
}
