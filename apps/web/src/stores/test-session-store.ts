import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ProcessLogEntry } from '@awaitstep/codegen'
import { MAX_TRIGGER_PAYLOAD_BYTES } from '../lib/ide/session-log'
import { boundPersistedText } from './bounded-persist'
import {
  isRememberedStateUsable,
  registerRememberedWiper,
  rememberedEnvelope,
  rememberedInputsStorage,
  TEST_SESSION_STORAGE_KEY,
} from './remembered-inputs'

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
  /** Lines up to this id were hidden by Clear view; the session's log goes on. */
  clearedBefore: number
  /** Why the stream is not connected, when something went wrong. */
  streamError: string | null
  nextLineId: number
}

/** How many workflows' payloads are remembered; the oldest go first. */
export const MAX_REMEMBERED_PAYLOADS = 50
export const DEFAULT_PAYLOAD = '{}'

interface TestSessionState {
  views: Record<string, SessionView>
  /** The trigger payload being edited, per workflow, remembered across reloads. */
  payloads: Record<string, string>
  /** Why the last trigger attempt was refused; cleared by the next edit. Never persisted. */
  payloadErrors: Record<string, string>
  appendLogs: (sessionId: string, entries: readonly ProcessLogEntry[], cursor: string) => void
  setResult: (sessionId: string, result: SessionTriggerResult | null) => void
  setPayload: (workflowId: string, payload: string) => void
  setPayloadError: (workflowId: string, error: string | null) => void
  /** Hides the lines logged so far from the Output view. */
  clearView: (sessionId: string) => void
  setStreamError: (sessionId: string, error: string | null) => void
  /** Forgets everything about a session — a new one starts from nothing. */
  reset: (sessionId: string) => void
}

const EMPTY: SessionView = {
  logs: [],
  lastResult: null,
  clearedBefore: 0,
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
export const useTestSessionStore = create<TestSessionState>()(
  persist(
    (set) => ({
      views: {},
      payloads: {},
      payloadErrors: {},

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
            combined.length > MAX_LOG_LINES
              ? combined.slice(combined.length - MAX_LOG_LINES)
              : combined
          return { views: { ...state.views, [sessionId]: { ...view, logs, cursor, nextLineId } } }
        }),

      setResult: (sessionId, lastResult) =>
        set((state) => ({
          views: {
            ...state.views,
            [sessionId]: { ...(state.views[sessionId] ?? EMPTY), lastResult },
          },
        })),

      setPayload: (workflowId, payload) =>
        set((state) => {
          // Re-inserted last, so trimming drops the workflow touched longest ago.
          const { [workflowId]: _old, ...others } = state.payloads
          const entries = Object.entries({ ...others, [workflowId]: payload })
          const { [workflowId]: _error, ...errors } = state.payloadErrors
          return {
            payloads: Object.fromEntries(entries.slice(-MAX_REMEMBERED_PAYLOADS)),
            payloadErrors: errors,
          }
        }),

      setPayloadError: (workflowId, error) =>
        set((state) => {
          const { [workflowId]: _old, ...rest } = state.payloadErrors
          return { payloadErrors: error === null ? rest : { ...rest, [workflowId]: error } }
        }),

      clearView: (sessionId) =>
        set((state) => {
          const view = state.views[sessionId] ?? EMPTY
          return {
            views: { ...state.views, [sessionId]: { ...view, clearedBefore: view.nextLineId - 1 } },
          }
        }),

      setStreamError: (sessionId, streamError) =>
        set((state) => ({
          views: {
            ...state.views,
            [sessionId]: { ...(state.views[sessionId] ?? EMPTY), streamError },
          },
        })),

      reset: (sessionId) =>
        set((state) => {
          const { [sessionId]: _removed, ...rest } = state.views
          return { views: rest }
        }),
    }),
    {
      name: TEST_SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => rememberedInputsStorage()),
      // Only the payload is a convenience worth keeping: logs, results and
      // errors belong to a session that will not exist after a reload.
      // A payload the server would refuse is not worth keeping, and the total
      // is bounded so a full origin never makes every keystroke fail.
      partialize: (state) => ({
        ...rememberedEnvelope(),
        payloads: boundPersistedText(state.payloads, (p) => p.length, MAX_TRIGGER_PAYLOAD_BYTES),
      }),
      // Stored payloads that are another person's, too old or from before
      // owners were recorded are not loaded.
      merge: (persisted, current) =>
        isRememberedStateUsable(persisted)
          ? { ...current, ...(persisted as Partial<TestSessionState>) }
          : current,
    },
  ),
)

registerRememberedWiper(() =>
  useTestSessionStore.setState({ payloads: {}, payloadErrors: {}, views: {} }),
)

/** The view for a session, or an empty one — never undefined at a call site. */
export function sessionView(
  views: Record<string, SessionView>,
  sessionId: string | null,
): SessionView {
  return (sessionId ? views[sessionId] : undefined) ?? EMPTY
}
