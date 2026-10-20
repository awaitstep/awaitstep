import { buildWorkerSource, unrunnableReason, type QuickTestArgs } from './quick-test'

export interface QuickTestLog {
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

export interface QuickTestResult {
  /**
   * `refused` is the step never running — it would not compile, or would
   * not load. Kept apart from `error` because "Threw" over a compile error
   * reads as the user's code having failed at runtime. `aborted` means the
   * caller went away; nothing should be shown for it.
   */
  status: 'ok' | 'error' | 'timeout' | 'refused' | 'aborted'
  /** The step's return value as JSON text; empty when it returned nothing. */
  result: string
  /**
   * Message only, deliberately. A worker stack numbers lines in the
   * generated script — prelude, stub and transpiled output included — so
   * every frame would point somewhere the file on screen does not have.
   */
  error: { message: string } | null
  logs: QuickTestLog[]
  /** How long the step itself ran; loading the transpiler is not the step. */
  durationMs: number
}

/** Long enough for a step that calls an API, short enough to not look hung. */
export const QUICK_TEST_TIMEOUT_MS = 10_000

/** The step ran and failed. */
export function failedResult(
  message: string,
  logs: QuickTestLog[] = [],
  durationMs = 0,
): QuickTestResult {
  return { status: 'error', result: '', error: { message }, logs, durationMs }
}

/** The step never ran: it would not compile, or would not load. */
export function refusedResult(message: string): QuickTestResult {
  return { status: 'refused', result: '', error: { message }, logs: [], durationMs: 0 }
}

interface WorkerMessage {
  type: 'log' | 'done' | 'failed'
  level?: QuickTestLog['level']
  text?: string
  result?: string
  message?: string
}

/**
 * Runs one step module in a Web Worker and reports what it did.
 *
 * The worker is terminated on every path — done, thrown, timed out,
 * abandoned — because a body with a `while (true)` in it is exactly the kind
 * of mistake someone reaches for a quick test to find, and a leaked worker
 * would keep a core busy for the rest of the session.
 *
 * Note this is the page's own origin: a Worker is an isolation boundary for
 * the DOM, not a security sandbox. That is the same trust as the editor the
 * code was typed into, but it does mean quick test is not a safe way to run
 * code from somewhere else.
 */
export async function runQuickTest(opts: {
  path: string
  source: string
  args: QuickTestArgs
  timeoutMs?: number
  /** Aborting kills the worker; the result is `aborted` and means nothing. */
  signal?: AbortSignal
}): Promise<QuickTestResult> {
  const logs: QuickTestLog[] = []

  let js: string
  try {
    // Loaded on demand: the transpiler is the heaviest thing this panel
    // touches, and most visits to the workspace never run a quick test.
    const { transpileFile } = await import('@awaitstep/codegen/transpile')
    js = await transpileFile(opts.path, opts.source)
  } catch (err) {
    return refusedResult(err instanceof Error ? err.message : String(err))
  }

  // Judged here rather than on the source: the transpiler erases what is
  // only a type, so only what survives it would reach the worker.
  const unrunnable = unrunnableReason(js)
  if (unrunnable !== null) return refusedResult(unrunnable)

  if (opts.signal?.aborted) {
    return { status: 'aborted', result: '', error: null, logs, durationMs: 0 }
  }

  const url = URL.createObjectURL(new Blob([buildWorkerSource(js)], { type: 'text/javascript' }))
  const worker = new Worker(url)
  // Started once the step is actually handed over, so the reported time is
  // the step's and not the transpiler's first load.
  let startedAt = 0
  const since = () => (startedAt === 0 ? 0 : Date.now() - startedAt)

  try {
    return await new Promise<QuickTestResult>((resolve) => {
      const timeoutMs = opts.timeoutMs ?? QUICK_TEST_TIMEOUT_MS
      const timer = setTimeout(() => {
        settle({
          status: 'timeout',
          result: '',
          error: {
            message: `The step did not finish within ${Math.round(timeoutMs / 1000)}s and was stopped.`,
          },
          logs,
          durationMs: since(),
        })
      }, timeoutMs)

      function handleAbort() {
        settle({ status: 'aborted', result: '', error: null, logs, durationMs: since() })
      }

      function settle(result: QuickTestResult) {
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', handleAbort)
        resolve(result)
      }

      opts.signal?.addEventListener('abort', handleAbort, { once: true })

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data
        if (message.type === 'log') {
          logs.push({ level: message.level ?? 'log', text: message.text ?? '' })
          return
        }
        if (message.type === 'done') {
          settle({
            status: 'ok',
            result: message.result ?? '',
            error: null,
            logs,
            durationMs: since(),
          })
          return
        }
        settle(failedResult(message.message ?? 'The step failed.', logs, since()))
      }

      // A script-level failure (bad syntax that survived transpiling, a
      // reference to something the worker has no business having) never
      // reaches onmessage.
      worker.onerror = (event) => {
        settle(refusedResult(event.message || 'The step could not be loaded.'))
      }

      // The script only defines the step; this is what runs it. Posted after
      // the handlers are attached so a step that answers immediately cannot
      // reply into a worker nobody is listening to.
      startedAt = Date.now()
      worker.postMessage(opts.args)
    })
  } finally {
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}
