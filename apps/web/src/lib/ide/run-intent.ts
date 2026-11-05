import type { TestSession } from '../api-client'

export type RunIntentKind =
  'quickTest' | 'trigger' | 'startAndTrigger' | 'restartAndTrigger' | 'busy'

export interface RunIntent {
  kind: RunIntentKind
  /** What the Run button says it will do. */
  label: string
  /** Running it first needs the unsaved files saved (a session only runs stored files). */
  needsSave: boolean
}

export interface RunIntentInput {
  /** The open file is a step module with a default export. */
  isStep: boolean
  session: TestSession | null
  /** A start or stop request is in flight. */
  starting: boolean
  stopping: boolean
  /** A trigger is waiting for the workflow to answer. */
  triggering: boolean
  /** The session runs older code than what is saved, and that was not accepted. */
  behind: boolean
  unsavedCount: number
}

/**
 * What Run does for the open file. A step file is tried in the browser;
 * anything else goes through the test session, which is started (or restarted
 * when it is behind) first. A session still coming up cannot be triggered, and
 * queueing it would hide a wait behind a button press, so Run says so instead.
 * The same goes for a trigger still waiting for its answer: a second one would
 * run the workflow twice.
 *
 * A session only ever holds saved files, so unsaved edits need a question
 * whenever Run would use a session: before it starts one, and also before it
 * triggers a running one that cannot contain them.
 */
export function runIntent(input: RunIntentInput): RunIntent {
  if (input.isStep) return { kind: 'quickTest', label: 'Quick test step', needsSave: false }
  if (input.stopping) return { kind: 'busy', label: 'Stopping…', needsSave: false }
  if (input.triggering) return { kind: 'busy', label: 'Running…', needsSave: false }
  const status = input.session?.status
  if (input.starting || status === 'starting') {
    return { kind: 'busy', label: 'Starting…', needsSave: false }
  }
  if (status === 'running') {
    if (!input.behind) {
      return { kind: 'trigger', label: 'Trigger session', needsSave: input.unsavedCount > 0 }
    }
    return {
      kind: 'restartAndTrigger',
      label: 'Restart and trigger',
      needsSave: input.unsavedCount > 0,
    }
  }
  return {
    kind: 'startAndTrigger',
    label: 'Start and trigger',
    needsSave: input.unsavedCount > 0,
  }
}

/** Which of the palette's session commands can do something right now. */
export function sessionCommands(
  session: TestSession | null,
  pending: { starting: boolean; stopping: boolean; triggering: boolean },
): { canStart: boolean; canStop: boolean; canTrigger: boolean } {
  const status = session?.status
  const busy = pending.starting || pending.stopping
  return {
    // A start or stop in flight is the same request pressed twice.
    canStart: !busy && status !== 'running' && status !== 'starting',
    canStop: !pending.stopping && (status === 'running' || status === 'starting'),
    canTrigger: !busy && !pending.triggering && status === 'running',
  }
}
