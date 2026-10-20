import { create } from 'zustand'
import type { ProcessLogEntry } from '@awaitstep/codegen'

/** A log line with an identity that survives the buffer being trimmed. */
export interface SessionLogLine extends ProcessLogEntry {
  id: number
}

export interface SessionTriggerResult {
  status: number
  body: unknown
}

/** How many lines the Output tab keeps. A long session produces far more. */
export const MAX_LOG_LINES = 2_000

interface SessionView {
  logs: SessionLogLine[]
  /** Where the server's log stream got to; kept per session, not per mount. */
  cursor?: string
  lastResult: SessionTriggerResult | null
  /** The trigger payload the user is editing. */
  payload: string
  /** Why the stream is not connected, when something went wrong. */
  streamError: string | null
  nextLineId: number
}

interface TestSessionState {
  views: Record<string, SessionView>
  appendLogs: (sessionId: string, entries: readonly ProcessLogEntry[], cursor: string) => void
  setResult: (sessionId: string, result: SessionTriggerResult | null) => void
  setPayload: (sessionId: string, payload: string) => void
  setStreamError: (sessionId: string, error: string | null) => void
  /** Forgets everything about a session — a new one starts from nothing. */
  reset: (sessionId: string) => void
}

const EMPTY: SessionView = {
  logs: [],
  lastResult: null,
  payload: '{}',
  streamError: null,
  nextLineId: 1,
}

export const EMPTY_SESSION_VIEW: SessionView = EMPTY

/**
 * What the IDE knows about a test session beyond the session record itself:
 * its output, the last response, the payload being edited.
 *
 * Deliberately outside the dock's component tree. Closing the dock unmounts
 * its panels, and holding this there meant hiding the dock threw away the
 * logs and dropped the stream — which then let the server reap the session
 * as idle while the user thought it was running.
 */
export const useTestSessionStore = create<TestSessionState>()((set) => ({
  views: {},

  appendLogs: (sessionId, entries, cursor) =>
    set((state) => {
      const view = state.views[sessionId] ?? EMPTY
      if (entries.length === 0) {
        return { views: { ...state.views, [sessionId]: { ...view, cursor } } }
      }
      let nextLineId = view.nextLineId
      const appended = entries.map((entry) => ({ ...entry, id: nextLineId++ }))
      const combined = [...view.logs, ...appended]
      // Oldest out: the newest lines are the ones being waited on.
      const logs =
        combined.length > MAX_LOG_LINES ? combined.slice(combined.length - MAX_LOG_LINES) : combined
      return { views: { ...state.views, [sessionId]: { ...view, logs, cursor, nextLineId } } }
    }),

  setResult: (sessionId, lastResult) =>
    set((state) => ({
      views: { ...state.views, [sessionId]: { ...(state.views[sessionId] ?? EMPTY), lastResult } },
    })),

  setPayload: (sessionId, payload) =>
    set((state) => ({
      views: { ...state.views, [sessionId]: { ...(state.views[sessionId] ?? EMPTY), payload } },
    })),

  setStreamError: (sessionId, streamError) =>
    set((state) => ({
      views: { ...state.views, [sessionId]: { ...(state.views[sessionId] ?? EMPTY), streamError } },
    })),

  reset: (sessionId) =>
    set((state) => {
      const { [sessionId]: _removed, ...rest } = state.views
      return { views: rest }
    }),
}))

/** The view for a session, or an empty one — never undefined at a call site. */
export function sessionView(
  views: Record<string, SessionView>,
  sessionId: string | null,
): SessionView {
  return (sessionId ? views[sessionId] : undefined) ?? EMPTY
}
