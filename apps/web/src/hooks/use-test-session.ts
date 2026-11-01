import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { actionToast, failureLine } from '../lib/action-toast'
import type { ProcessLogEntry } from '@awaitstep/codegen'
import { api, projectUrl, ApiError } from '../lib/api-client'
import type { TestSession } from '../lib/api-client'
import { readSseStream, reconnectDelay } from '../lib/sse-stream'
import {
  sessionView,
  useTestSessionStore,
  type SessionLogLine,
  type SessionTriggerResult,
} from '../stores/test-session-store'

/** A session still starting is worth re-reading; a settled one is not. */
const STARTING_POLL_MS = 1_500
/** A trigger that never returns must not hold the UI hostage. */
const TRIGGER_TIMEOUT_MS = 60_000

interface UseTestSessionOptions {
  workflowId: string
  /** The version the workspace is showing, so a stale session is visible. */
  versionId?: string | null
}

export interface TestSessionState {
  session: TestSession | null
  logs: SessionLogLine[]
  lastResult: SessionTriggerResult | null
  payload: string
  /** Set while that particular action is in flight — they are independent. */
  starting: boolean
  stopping: boolean
  triggering: boolean
  /** The session is running code from an older version than the editor shows. */
  stale: boolean
  streamError: string | null
  /** Why the last start, stop or trigger failed; the toast only says that it did. */
  actionError: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  trigger: (payload: unknown) => Promise<void>
  setPayload: (payload: string) => void
}

export const testSessionKey = (workflowId: string) => ['workflow-test-session', workflowId] as const

/**
 * Owns one workflow's test session.
 *
 * The session record is server state, so it lives in the query cache and is
 * re-read while it is still starting — nothing else would ever move the UI
 * off "Starting…". Everything else the IDE knows about the session (output,
 * last response, the payload being edited) lives in a store outside the dock,
 * so closing the dock cannot discard it or drop the stream.
 */
export function useTestSession({ workflowId, versionId }: UseTestSessionOptions): TestSessionState {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: session = null } = useQuery({
    queryKey: testSessionKey(workflowId),
    queryFn: () => api.getTestSession(workflowId).then((r) => r.session),
    // Only while it is coming up: a running session reports through its
    // stream, and a finished one does not change again.
    refetchInterval: (query) =>
      query.state.data?.status === 'starting' ? STARTING_POLL_MS : false,
    retry: false,
  })

  const sessionId = session?.id ?? null
  const view = useTestSessionStore(useShallow((s) => sessionView(s.views, sessionId)))
  const {
    appendLogs,
    setResult,
    setStreamError,
    setPayload: storePayload,
    reset,
  } = useTestSessionStore(
    useShallow((s) => ({
      appendLogs: s.appendLogs,
      setResult: s.setResult,
      setStreamError: s.setStreamError,
      setPayload: s.setPayload,
      reset: s.reset,
    })),
  )

  const setSession = useCallback(
    (next: TestSession | null) => queryClient.setQueryData(testSessionKey(workflowId), next),
    [queryClient, workflowId],
  )
  const refetchSession = useCallback(
    () => queryClient.invalidateQueries({ queryKey: testSessionKey(workflowId) }),
    [queryClient, workflowId],
  )

  // The cursor is read inside the stream loop but must not restart it.
  const cursorRef = useRef<string | undefined>(view.cursor)
  cursorRef.current = view.cursor

  const streaming = session?.status === 'running'

  useEffect(() => {
    if (!sessionId || !streaming) return
    const controller = new AbortController()
    let attempt = 0

    async function connect(): Promise<void> {
      while (!controller.signal.aborted) {
        try {
          const query = cursorRef.current ? `?after=${encodeURIComponent(cursorRef.current)}` : ''
          const response = await fetch(projectUrl(`/test-sessions/${sessionId}/stream${query}`), {
            credentials: 'include',
            signal: controller.signal,
          })
          if (response.status === 410 || response.status === 404) {
            // Gone for good: re-read it so the summary can say why.
            await refetchSession()
            return
          }
          if (!response.ok) throw new Error(`Log stream failed (${response.status})`)

          attempt = 0
          setStreamError(sessionId!, null)
          let final = false
          await readSseStream(
            response,
            (event) => {
              if (event.event === 'logs') {
                const page = JSON.parse(event.data) as {
                  entries: ProcessLogEntry[]
                  cursor: string
                }
                appendLogs(sessionId!, page.entries, page.cursor)
                return true
              }
              if (event.event === 'closed') {
                // `final` is the signal; the wording is for people.
                final = (JSON.parse(event.data) as { final?: boolean }).final === true
                return false
              }
              return true
            },
            controller.signal,
          )

          if (final) {
            await refetchSession()
            return
          }
          // The stream expired on schedule — reconnect straight away.
        } catch (err) {
          if (controller.signal.aborted) return
          attempt += 1
          // Say so: a stream that dies silently leaves the UI claiming the
          // session is healthy while nothing touches it and it gets reaped.
          setStreamError(sessionId!, failureLine(err, 'Lost the log stream — retrying'))
          await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)))
        }
      }
    }

    void connect()
    return () => controller.abort()
  }, [sessionId, streaming, appendLogs, setStreamError, refetchSession])

  const start = useCallback(async () => {
    setStarting(true)
    setActionError(null)
    try {
      const { session: started, reused } = await api.startTestSession(workflowId)
      // A new session starts from nothing; a reused one keeps its cursor, or
      // the server replays every line it has already shown.
      if (!reused) reset(started.id)
      setSession(started)
      actionToast.success('Test session started')
    } catch (err) {
      setActionError(failureLine(err, 'Could not start a test session'))
      actionToast.error(failureLine(err, 'Couldn’t start the test session'))
    } finally {
      setStarting(false)
    }
  }, [workflowId, reset, setSession])

  const stop = useCallback(async () => {
    if (!sessionId) return
    setStopping(true)
    setActionError(null)
    try {
      await api.stopTestSession(sessionId)
      setSession(null)
      actionToast.success('Test session stopped')
    } catch (err) {
      // Not swallowed: a failed stop can leave a container running and
      // billing while the UI claims it is gone.
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setSession(null)
        actionToast.success('Test session stopped')
      } else {
        setActionError(failureLine(err, 'Could not stop the test session'))
        actionToast.error(failureLine(err, 'Couldn’t stop the test session'))
        await refetchSession()
      }
    } finally {
      setStopping(false)
    }
  }, [sessionId, setSession, refetchSession])

  const trigger = useCallback(
    async (payload: unknown) => {
      if (!sessionId) return
      setTriggering(true)
      setActionError(null)
      try {
        const result = await api.triggerTestSession(sessionId, payload, {
          timeoutMs: TRIGGER_TIMEOUT_MS,
        })
        setResult(sessionId, result)
        actionToast.success('Workflow triggered')
      } catch (err) {
        if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
          await refetchSession()
        }
        setActionError(failureLine(err, 'Could not reach the test session'))
        actionToast.error(failureLine(err, 'Couldn’t trigger the workflow'))
      } finally {
        setTriggering(false)
      }
    },
    [sessionId, setResult, refetchSession],
  )

  const setPayload = useCallback(
    (next: string) => {
      if (sessionId) storePayload(sessionId, next)
    },
    [sessionId, storePayload],
  )

  return {
    session,
    logs: view.logs,
    lastResult: view.lastResult,
    payload: view.payload,
    starting,
    stopping,
    triggering,
    stale: Boolean(session && versionId && session.versionId !== versionId),
    streamError: view.streamError,
    actionError,
    start,
    stop,
    trigger,
    setPayload,
  }
}
