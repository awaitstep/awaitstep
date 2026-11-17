import { spawn, type ChildProcess } from 'node:child_process'

/** A deploy stopped because it was cancelled. */
export class DeployCancelledError extends Error {
  override readonly name = 'DeployCancelledError'
  constructor() {
    super('Deploy cancelled')
  }
}

/** Throws {@link DeployCancelledError} once `signal` is aborted. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DeployCancelledError()
}

export interface RunToEndOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout: number
  /** Aborting it stops the command and everything it started. */
  signal?: AbortSignal
  /**
   * What failure messages call it ("npm install", "wrangler deploy"). They
   * never carry the command's path: they reach the deployment's row.
   */
  label?: string
  /**
   * False for a run that must not be cut short when the API exits — the
   * upload, which stopped halfway could leave a version partly live.
   * Default true.
   */
  killOnExit?: boolean
}

/** A command that failed: what it printed, and how it ended. */
export interface RunFailure extends Error {
  stdout: string
  stderr: string
  code: number | null
  /** It ran past its timeout and was stopped. */
  killed: boolean
}

// Output kept per stream; past it the oldest part is dropped. execFile's
// default limit is 1 MB, and a failed install can print more than that.
const MAX_OUTPUT = 1024 * 1024
// How long a stopped group gets to exit before it is killed outright.
const KILL_GRACE_MS = 5_000
// After the kill, how long to wait for the pipes to close before giving up on them.
const SETTLE_AFTER_KILL_MS = 1_000

const DETACHED = process.platform !== 'win32'

// The groups still running. In their own groups they don't get the terminal's
// Ctrl+C, so they are killed when this process exits (the entries exit on
// SIGINT/SIGTERM): an install or upload never outlives the API.
const running = new Set<ChildProcess>()
let exitHookInstalled = false

function track(child: ChildProcess): void {
  if (!exitHookInstalled) {
    exitHookInstalled = true
    process.once('exit', killTrackedGroups)
  }
  running.add(child)
}

/**
 * Kills every group still running that may be stopped (not an upload). Runs
 * when the process exits; callable on its own for a shutdown that doesn't.
 */
export function killTrackedGroups(): void {
  for (const c of running) signalGroup(c, 'SIGKILL')
}

/**
 * Runs a command to its end, as `execFile` does, but in its own process
 * group: a cancel or a timeout stops the command and everything it started.
 * Wrangler's launcher runs its CLI as a child process and npm runs its own,
 * so signalling the direct child alone would leave them running.
 *
 * A stopped group gets SIGTERM, then SIGKILL after {@link KILL_GRACE_MS}
 * whether or not its leader has already exited (a child that ignores SIGTERM
 * outlives the leader and holds its pipes). Resolves with the output of a run
 * that exited 0. Rejects with a {@link RunFailure} for a non-zero exit or a
 * timeout, and with {@link DeployCancelledError} when `signal` aborted, once
 * the group is gone, so the caller's cleanup never races the command.
 */
export function runToEnd(
  command: string,
  args: string[],
  options: RunToEndOptions,
): Promise<{ stdout: string; stderr: string }> {
  if (options.signal?.aborted) return Promise.reject(new DeployCancelledError())
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Leads its own group, so the group can be signalled as one.
      detached: DETACHED,
    })
    if (options.killOnExit !== false) track(child)
    const label = options.label ?? 'The command'
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-MAX_OUTPUT)
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_OUTPUT)
    })

    let stoppedBy: 'timeout' | 'cancel' | null = null
    let settled = false
    const timers: Array<ReturnType<typeof setTimeout>> = []

    const finish = (outcome: () => void) => {
      if (settled) return
      settled = true
      running.delete(child)
      for (const t of timers) clearTimeout(t)
      options.signal?.removeEventListener('abort', onAbort)
      outcome()
    }
    const stoppedOutcome = (code: number | null) => () => {
      if (stoppedBy === 'cancel') return reject(new DeployCancelledError())
      reject(
        failure(
          `${label} timed out after ${Math.round(options.timeout / 1000)} s`,
          stdout,
          stderr,
          code,
          true,
        ),
      )
    }
    const stop = (why: 'timeout' | 'cancel') => {
      if (stoppedBy || settled) return
      stoppedBy = why
      signalGroup(child, 'SIGTERM')
      timers.push(
        setTimeout(() => {
          signalGroup(child, 'SIGKILL')
          // A process that left the group can keep the pipes open: settle anyway.
          timers.push(
            setTimeout(() => {
              child.stdout?.destroy()
              child.stderr?.destroy()
              finish(stoppedOutcome(child.exitCode))
            }, SETTLE_AFTER_KILL_MS),
          )
        }, KILL_GRACE_MS),
      )
    }
    timers.push(setTimeout(() => stop('timeout'), options.timeout))
    const onAbort = () => stop('cancel')
    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', (err) => {
      // The error's own message names the executable's path: only its code goes out.
      const code = (err as NodeJS.ErrnoException).code
      finish(() =>
        reject(
          failure(
            `${label} could not start${code ? ` (${code})` : ''}`,
            stdout,
            stderr,
            null,
            false,
          ),
        ),
      )
    })
    child.on('close', (code) => {
      finish(() => {
        if (stoppedBy) return stoppedOutcome(code)()
        if (code === 0) return resolve({ stdout, stderr })
        reject(failure(`${label} exited with code ${code}`, stdout, stderr, code, false))
      })
    })
  })
}

function failure(
  message: string,
  stdout: string,
  stderr: string,
  code: number | null,
  killed: boolean,
): RunFailure {
  return Object.assign(new Error(message), { stdout, stderr, code, killed })
}

/**
 * Signals the child's whole group. The group outlives its leader while any
 * member runs, so it is signalled whatever the leader's state; a group that
 * is already gone (ESRCH) is fine. Without groups (Windows), the child alone.
 */
function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  if (DETACHED) {
    try {
      process.kill(-child.pid, signal)
    } catch {
      // ESRCH: nothing left in the group.
    }
    return
  }
  if (child.exitCode === null && child.signalCode === null) child.kill(signal)
}
