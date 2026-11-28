import { useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { actionToast, failureLine } from '../lib/action-toast'
import type { TestSession } from '../lib/api-client'
import { responseLine } from '../lib/ide/session-log'
import { sentEventLine, type KnownInstance } from '../lib/ide/test-instance'
import { sessionView, useTestSessionStore } from '../stores/test-session-store'
import { useApi } from '../contexts/api-client-context'

export interface TestInstanceState {
  /** The instance the pane shows: the last triggered, or the one picked. */
  selected: KnownInstance | null
  /** This session's instances, newest first. */
  instances: KnownInstance[]
  select: (instanceId: string) => void
  /** Resolves true when the runner took the event. */
  sendEvent: (type: string, payload: unknown) => Promise<boolean>
  terminate: () => Promise<void>
  sending: boolean
  terminating: boolean
}

/**
 * One test session's instances as the Instance pane shows them. The stream
 * that keeps them current is the session's own (`useTestSession`): it follows
 * whichever instance is selected here.
 */
export function useTestInstance(session: TestSession | null): TestInstanceState {
  const api = useApi()
  const sessionId = session?.id ?? null
  const { instance, instances, selectInstance, refollowInstance, appendLocal } =
    useTestSessionStore(
      useShallow((s) => {
        const view = sessionView(s.views, sessionId)
        return {
          instance: view.instance,
          instances: view.instances,
          selectInstance: s.selectInstance,
          refollowInstance: s.refollowInstance,
          appendLocal: s.appendLocal,
        }
      }),
    )
  const [sending, setSending] = useState(false)
  const [terminating, setTerminating] = useState(false)
  // Refs as well as state: two clicks in one frame both see the state from before either.
  const sendingRef = useRef(false)
  const terminatingRef = useRef(false)
  const selectedId = instance?.id ?? null
  const selected = selectedId
    ? (instances.find((known) => known.id === selectedId) ?? { id: selectedId })
    : null

  const select = useCallback(
    (instanceId: string) => {
      if (sessionId) selectInstance(sessionId, instanceId)
    },
    [sessionId, selectInstance],
  )

  const sendEvent = useCallback(
    async (type: string, payload: unknown): Promise<boolean> => {
      if (!sessionId || !selectedId || sendingRef.current) return false
      sendingRef.current = true
      setSending(true)
      try {
        const result = await api.sendTestSessionEvent(sessionId, selectedId, { type, payload })
        appendLocal(sessionId, [sentEventLine(type, selectedId, Date.now())])
        if (result.status < 200 || result.status >= 300) {
          appendLocal(sessionId, [responseLine(result, Date.now())])
          return false
        }
        // Read it again, unless another instance was picked meanwhile.
        refollowInstance(sessionId, selectedId)
        return true
      } catch (err) {
        actionToast.error(failureLine(err, 'Couldn’t send the event'))
        return false
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [api, sessionId, selectedId, appendLocal, refollowInstance],
  )

  const terminate = useCallback(async () => {
    if (!sessionId || !selectedId || terminatingRef.current) return
    terminatingRef.current = true
    setTerminating(true)
    try {
      const result = await api.terminateTestSessionInstance(sessionId, selectedId)
      appendLocal(sessionId, [responseLine(result, Date.now())])
      refollowInstance(sessionId, selectedId)
    } catch (err) {
      actionToast.error(failureLine(err, 'Couldn’t terminate the instance'))
    } finally {
      terminatingRef.current = false
      setTerminating(false)
    }
  }, [api, sessionId, selectedId, appendLocal, refollowInstance])

  return { selected, instances, select, sendEvent, terminate, sending, terminating }
}
