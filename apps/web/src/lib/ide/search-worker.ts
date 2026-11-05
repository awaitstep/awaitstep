import { runSearch, type SearchFile, type SearchOutcome } from './search'
import type { SearchReply, SearchRequest } from './search-client'

// Runs in a dedicated Worker: a pattern that backtracks forever blocks this
// thread only, and the client terminates it.
let files: readonly SearchFile[] = []
let filesId = -1

// A throw (a RangeError from the regex engine, say) is reported as a failure
// instead of leaving the client waiting for its timeout.
function runGuarded(request: SearchRequest): SearchOutcome {
  try {
    return runSearch(files, request.options)
  } catch {
    return { kind: 'failed' }
  }
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const request = event.data
  if (request.files) {
    files = request.files
    filesId = request.filesId
  }
  // The client sent no files because it believes this worker holds them.
  const outcome = filesId === request.filesId ? runGuarded(request) : ({ kind: 'stale' } as const)
  const reply: SearchReply = { id: request.id, outcome }
  self.postMessage(reply)
}
