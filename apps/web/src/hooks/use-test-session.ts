import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { actionToast, failureLine } from '../lib/action-toast'
import type { ProcessLogEntry } from '@awaitstep/codegen'
import { api, projectUrl, ApiError } from '../lib/api-client'
import type { TestSession } from '../lib/api-client'
import { sessionStaleness, type SessionStaleness } from '../lib/ide/session-staleness'
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
  /** `{ path: hash }` of the stored project files now; what the session is compared with. */
  currentHashes?: Readonly<Record<string, string>> | null
  /** Files with unsaved edits; they are never part of a session. */
  unsavedCount?: number
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
  /** How far the session is behind the version and files the editor shows. */
  stale: SessionStaleness
  streamError: string | null
  /** Why the last start, stop or trigger failed; the toast only says that it did. */
  actionError: string | null
  /** Resolves true when a session was started (or reused). */
  start: () => Promise<boolean>
  stop: () => Promise<void>
  trigger: (payload: unknown) => Promise<void>
  /** Stops the session and starts a fresh one from the saved files. */
  /** The saved changes "Trigger anyway" accepted for this session; asked again after the next save. */
  acceptedSignature: string | null
  acceptStale: (signature: string) => void
  restart: () => Promise<boolean>
  /** Restarts, waits for the new session to run, then triggers it. */
  restartAndTrigger: (payload: unknown) => Promise<void>
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
const NO_HASHES: Readonly<Record<string, string>> = {}
/** How long a restart-and-trigger waits for the new container. */
const RESTART_WAIT_MS = 90_000

export function useTestSession({
  workflowId,
  versionId,
  currentHashes = NO_HASHES,
  unsavedCount = 0,
}: UseTestSessionOptions): TestSessionState {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Which saved changes the person already chose to test past. It lives here,
  // not in the Run panel, which unmounts whenever another dock tab is shown.
  const [accepted, setAccepted] = useState<{ sessionId: string; signature: string } | null>(null)

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
      return true
    } catch (err) {
      setActionError(failureLine(err, 'Could not start a test session'))
      actionToast.error(failureLine(err, 'Couldn’t start the test session'))
      return false
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

  const restart = useCallback(async (): Promise<boolean> => {
    if (sessionId) {
      try {
        await api.stopTestSession(sessionId)
      } catch (err) {
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 410))) {
          actionToast.error(failureLine(err, 'Couldn’t restart the test session'))
          return false
        }
      }
      setSession(null)
    }
    return start()
  }, [sessionId, setSession, start])

  // A restart-and-trigger outlives neither the workspace nor a newer click.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const restartAndTrigger = useCallback(
    async (payload: unknown) => {
      const previousId = sessionId
      // A failed stop or start has already said why; triggering the old
      // session here would run exactly the code the person chose to replace.
      if (!(await restart())) return
      const polls = RESTART_WAIT_MS / STARTING_POLL_MS
      let failedReads = 0
      for (let i = 0; i < polls && aliveRef.current; i += 1) {
        const current = await api
          .getTestSession(workflowId)
          .then((r) => r.session)
          .catch(() => undefined)
        if (!aliveRef.current) return
        if (current && current.id !== previousId && current.status === 'running') {
          setSession(current)
          setTriggering(true)
          try {
            const result = await api.triggerTestSession(current.id, payload, {
              timeoutMs: TRIGGER_TIMEOUT_MS,
            })
            setResult(current.id, result)
            actionToast.success('Workflow triggered')
          } catch (err) {
            actionToast.error(failureLine(err, 'Couldn’t trigger the workflow'))
          } finally {
            setTriggering(false)
          }
          return
        }
        // A read that failed is a blip, not an answer; a session that ended is.
        if (current === undefined) {
          failedReads += 1
          if (failedReads >= 3) break
        } else if (
          current === null ||
          (current.status !== 'starting' && current.id !== previousId)
        ) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, STARTING_POLL_MS))
      }
      if (aliveRef.current) {
        actionToast.error('The new test session didn’t start, so nothing was triggered')
      }
    },
    [sessionId, restart, workflowId, setSession, setResult],
  )

  const acceptStale = useCallback(
    (signature: string) => {
      if (sessionId) setAccepted({ sessionId, signature })
    },
    [sessionId],
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
    stale: sessionStaleness({
      session,
      versionId: versionId ?? null,
      currentHashes,
      unsavedCount,
    }),
    streamError: view.streamError,
    actionError,
    start,
    stop,
    trigger,
    acceptedSignature: accepted && accepted.sessionId === sessionId ? accepted.signature : null,
    acceptStale,
    restart,
    restartAndTrigger,
    setPayload,
  }
}
