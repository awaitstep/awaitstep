import { WORKER_ALIVE } from './quick-test'
import { QUICK_TEST_SANDBOX_SRC } from './quick-test-sandbox-page'

/**
 * The quick-test isolation boundary: a sandboxed iframe with an opaque
 * origin, hosting the worker that runs the step. The iframe loads the
 * sandbox page (quick-test-sandbox-page.ts), which holds the bootstrap.
 *
 * The iframe carries `sandbox="allow-scripts"` and nothing else — no
 * `allow-same-origin` — so the browser gives it a null origin: the step code
 * cannot send the user's session cookie anywhere, and a fetch to this app's
 * API is cross-origin with no credentials, refused by CORS. The worker inside
 * it keeps the step off the UI thread, and destroying the iframe destroys the
 * worker with it — the browser's own answer to a `while (true)`.
 */

export interface QuickTestSandbox {
  /** Hand the run arguments to the step worker (buffered until it exists). */
  start(args: unknown): void
  /** Stop the worker and tear the iframe down. */
  destroy(): void
}

export interface QuickTestSandboxCallbacks {
  /** A message from the step worker — log, done, failed. */
  onMessage(data: unknown): void
  /** The worker script would not load. */
  onLoadError(message: string): void
  /** The browser refused the sandbox itself (no worker ever existed). */
  onUnavailable(message: string): void
  /** The arguments were handed to the worker — the step is now running. */
  onStarted(): void
}

/**
 * How long the sandbox page gets to load. It is a network fetch — a cold
 * Worker or a slow link can take seconds — so it gets its own, generous
 * budget; a page that never loads (offline, blocked) still fails, as
 * "unavailable" rather than as a step that did not finish.
 */
export const SANDBOX_LOAD_TIMEOUT_MS = 15_000

/**
 * How long the bootstrap gets to say 'ready', counted from the page's
 * `load`: by then the page is here, and its script only has to run and open
 * a port, so a quiet three seconds means something — a CSP or an extension
 * blocking the sandbox page's script — and the user should hear that, not
 * "the step did not finish".
 */
export const SANDBOX_BOOT_TIMEOUT_MS = 3_000

interface BootstrapMessage {
  type: 'ready' | 'worker' | 'worker-error' | 'sandbox-unavailable'
  data?: unknown
  message?: string
}

function isAlive(data: unknown): boolean {
  return (data as { type?: unknown } | null)?.type === WORKER_ALIVE
}

export function createQuickTestSandbox(
  workerSource: string,
  callbacks: QuickTestSandboxCallbacks,
): QuickTestSandbox {
  const iframe = document.createElement('iframe')
  // The whole security property in one attribute: scripts may run, but the
  // origin stays opaque. Nothing may ever add allow-same-origin here.
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.style.display = 'none'
  // Its own page, under its own policy (quick-test-sandbox-page.ts); the
  // sandbox attribute is set first, so the page never loads without it.
  // Fingerprinted, so the browser may cache it across runs and deploys.
  iframe.src = QUICK_TEST_SANDBOX_SRC

  const channel = new MessageChannel()
  let pendingArgs: unknown | undefined
  let ready = false
  let destroyed = false
  let workerAlive = false

  let bootTimer: ReturnType<typeof setTimeout> | undefined
  let loadTimedOut = false
  const loadTimer = setTimeout(() => {
    if (ready || destroyed) return
    loadTimedOut = true
    callbacks.onUnavailable('the sandbox page didn’t load')
  }, SANDBOX_LOAD_TIMEOUT_MS)

  channel.port1.onmessage = (event: MessageEvent<BootstrapMessage>) => {
    if (destroyed) return
    const message = event.data
    if (message.type === 'ready') {
      ready = true
      clearTimeout(loadTimer)
      clearTimeout(bootTimer)
      if (pendingArgs !== undefined) {
        channel.port1.postMessage({ type: 'start', args: pendingArgs })
        pendingArgs = undefined
        callbacks.onStarted()
      }
      return
    }
    if (message.type === 'worker') {
      if (isAlive(message.data)) {
        workerAlive = true
        return
      }
      callbacks.onMessage(message.data)
      return
    }
    if (message.type === 'worker-error') {
      if (message.message) {
        callbacks.onLoadError(message.message)
      } else if (workerAlive) {
        // A running step failing in a way the browser does not describe:
        // reporting "unavailable" would blame the browser and drop its logs.
        callbacks.onLoadError('the step stopped with an error the browser didn’t describe')
      } else {
        // No worker ever ran: what an opaque-origin refusal to start a
        // worker looks like.
        callbacks.onUnavailable('the worker couldn’t start')
      }
      return
    }
    callbacks.onUnavailable(message.message ?? 'the sandbox couldn’t start')
  }

  iframe.addEventListener(
    'load',
    () => {
      // Already reported as unavailable: a page arriving late starts nothing.
      if (destroyed || loadTimedOut) return
      clearTimeout(loadTimer)
      bootTimer = setTimeout(() => {
        if (ready || destroyed) return
        callbacks.onUnavailable('the sandbox didn’t boot; a content security policy may block it')
      }, SANDBOX_BOOT_TIMEOUT_MS)
      const target = iframe.contentWindow
      if (!target) {
        callbacks.onUnavailable('the sandbox frame has no window')
        return
      }
      // '*' because an opaque origin cannot be named; the port, not the
      // origin, is what keeps this conversation private.
      target.postMessage({ type: 'init', workerSource }, '*', [channel.port2])
    },
    // A port can only be transferred once: a second load event re-posting it
    // would throw and leave the run hanging.
    { once: true },
  )

  document.body.appendChild(iframe)

  return {
    start(args: unknown) {
      if (destroyed) return
      if (ready) {
        channel.port1.postMessage({ type: 'start', args })
        callbacks.onStarted()
      } else {
        pendingArgs = args
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      clearTimeout(loadTimer)
      clearTimeout(bootTimer)
      // Belt and braces: the bootstrap terminates the worker on 'stop', and
      // removing the iframe discards the document — and with it the worker —
      // on the browser's schedule.
      if (ready) channel.port1.postMessage({ type: 'stop' })
      channel.port1.close()
      iframe.remove()
    },
  }
}
