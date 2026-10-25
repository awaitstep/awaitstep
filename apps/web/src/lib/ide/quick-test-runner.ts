import { buildWorkerSource, unrunnableReason, type QuickTestArgs } from './quick-test'
import { createQuickTestSandbox, type QuickTestSandbox } from './quick-test-sandbox'

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
 * Runs one step module in a worker inside a null-origin sandbox and reports
 * what it did.
 *
 * The sandbox is torn down on every path — done, thrown, timed out,
 * abandoned — because a body with a `while (true)` in it is exactly the kind
 * of mistake someone reaches for a quick test to find, and a leaked worker
 * would keep a core busy for the rest of the session.
 *
 * The opaque origin is the security boundary: generated step modules carry
 * marketplace node templates — someone else's code — and code run on the
 * page's own origin could ride the user's session. Inside the sandbox it has
 * no cookies and no API; see quick-test-sandbox.ts.
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

  // Started once the step is actually handed over, so the reported time is
  // the step's and not the transpiler's — or the sandbox's — first load.
  let startedAt = 0
  const since = () => (startedAt === 0 ? 0 : Date.now() - startedAt)

  // A holder, not a let: the assignment happens inside the promise executor,
  // which TypeScript's narrowing cannot see into from the finally below.
  const held: { sandbox: QuickTestSandbox | null } = { sandbox: null }
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

      function handleUnavailable(message: string) {
        settle(
          refusedResult(
            `Quick test could not start its sandbox in this browser${message ? ` (${message})` : ''}. Use Run to execute the whole workflow.`,
          ),
        )
      }

      let sandbox: QuickTestSandbox
      try {
        sandbox = createQuickTestSandbox(buildWorkerSource(js), {
          onMessage(data) {
            // The step's own code can post anything it likes; a shape this
            // panel does not know is noise, not a reason to hang the run.
            if (typeof data !== 'object' || data === null) return
            const message = data as WorkerMessage
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
            if (message.type === 'failed') {
              settle(failedResult(message.message ?? 'The step failed.', logs, since()))
            }
          },
          // Before the step ran, this is a script that never loaded (bad
          // syntax that survived transpiling, a reference the worker has no
          // business having). After it started, it is the step failing out of
          // band — an uncaught error in a timer, an unhandled rejection — and
          // "never ran" would blame code that plainly did, and drop its logs.
          onLoadError(message) {
            if (startedAt > 0) {
              settle(failedResult(message || 'The step failed.', logs, since()))
            } else {
              settle(refusedResult(message || 'The step could not be loaded.'))
            }
          },
          // The sandbox refusing to start is a browser limitation, never a
          // reason to fall back to running the step on the page's own origin.
          onUnavailable: handleUnavailable,
          onStarted() {
            startedAt = Date.now()
          },
        })
      } catch (err) {
        handleUnavailable(err instanceof Error ? err.message : String(err))
        return
      }
      held.sandbox = sandbox
      sandbox.start(opts.args)
    })
  } finally {
    held.sandbox?.destroy()
  }
}
