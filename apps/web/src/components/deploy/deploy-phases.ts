/** The three things a person waits on while a deploy runs (25d–25i). */
export type DeployPhaseKey = 'compile' | 'create' | 'live'

/**
 * `unknown`: the page lost the stream there, so it can't say how it ended.
 * `stopped`: a cancel stopped it there.
 */
export type DeployPhaseState = 'done' | 'doing' | 'failed' | 'idle' | 'unknown' | 'stopped'

/**
 * `lost`: the stream ended without a result; the server may still be deploying.
 * `cancelled`: it was stopped before the upload.
 */
export type DeployOutcome = 'deploying' | 'success' | 'error' | 'lost' | 'cancelled'

// The provider's progress stages, by the phase they belong to. Everything
// before `UPLOADING` is preparation on our side — installing, checking the
// build — so it counts as compiling, and a deploy there can still be
// cancelled. A stage this list doesn't know (another provider's) counts as
// compiling.
const STAGE_PHASE: Record<string, DeployPhaseKey> = {
  INITIALIZING: 'compile',
  GENERATING_CODE: 'compile',
  CODE_READY: 'compile',
  DETECTING_BINDINGS: 'compile',
  BINDINGS_READY: 'compile',
  CREATING_WORKER: 'compile',
  DEPLOYING: 'compile',
  UPLOADING: 'create',
  WORKER_DEPLOYED: 'live',
  UPDATING_WORKFLOW: 'live',
  COMPLETED: 'live',
}

const ORDER: DeployPhaseKey[] = ['compile', 'create', 'live']

const LABELS: Record<DeployPhaseKey, Record<DeployPhaseState, string>> = {
  compile: {
    done: 'Compiled',
    doing: 'Compiling',
    failed: 'Compiling',
    idle: 'Compile',
    unknown: 'Compiling',
    stopped: 'Compile',
  },
  create: {
    done: 'Worker created',
    doing: 'Creating the worker',
    failed: 'Creating the worker',
    idle: 'Create the worker',
    unknown: 'Creating the worker',
    stopped: 'Create the worker',
  },
  live: {
    done: 'Live',
    doing: 'Going live',
    failed: 'Go live',
    idle: 'Go live',
    unknown: 'Going live',
    stopped: 'Go live',
  },
}

/** Stages that carry no place: how it ended, not where it got to. */
const ENDINGS = new Set(['FAILED', 'CANCELLED'])

/** Which phase a progress stage belongs to; null for none yet (or an ending, which carries no place). */
export function phaseOfStage(stage: string | null | undefined): DeployPhaseKey | null {
  if (!stage || ENDINGS.has(stage)) return null
  return STAGE_PHASE[stage] ?? 'compile'
}

/** Whether a progress stage is a real place reached, not how the deploy ended. */
export function isPlaceStage(stage: string): boolean {
  return !ENDINGS.has(stage)
}

export interface DeployPhaseView {
  key: DeployPhaseKey
  state: DeployPhaseState
  label: string
}

/**
 * Each phase's state from the last stage reached and how the deploy ended.
 * `reached` is the last real stage (endings excluded); none yet reads as
 * compiling, so a deploy refused before its stream started failed there.
 */
export function deployPhases(reached: DeployPhaseKey | null, outcome: DeployOutcome) {
  const at = ORDER.indexOf(reached ?? 'compile')
  return ORDER.map((key, i): DeployPhaseView => {
    let state: DeployPhaseState
    if (outcome === 'success') state = 'done'
    else if (i < at) state = 'done'
    else if (i > at) state = 'idle'
    else if (outcome === 'error') state = 'failed'
    else if (outcome === 'lost') state = 'unknown'
    else if (outcome === 'cancelled') state = 'stopped'
    else state = 'doing'
    return { key, state, label: LABELS[key][state] }
  })
}

/** "Stopped at: creating the worker". */
export function stoppedAtLine(reached: DeployPhaseKey | null): string {
  return `Stopped at: ${LABELS[reached ?? 'compile'].failed.toLowerCase()}`
}

/** "Stopped while compiling". */
export function cancelledAtLine(reached: DeployPhaseKey | null): string {
  return `Stopped while ${LABELS[reached ?? 'compile'].doing.toLowerCase()}`
}

/**
 * Whether a failure can be said to have left the account as it was: only
 * before anything was sent to the provider. Once the upload started, part
 * of it may have been applied.
 */
export function failedBeforeUpload(reached: DeployPhaseKey | null): boolean {
  return (reached ?? 'compile') === 'compile'
}

/** Whether a running deploy can still be cancelled: until its upload starts. */
export function cancellableAt(reached: DeployPhaseKey | null): boolean {
  return (reached ?? 'compile') === 'compile'
}
