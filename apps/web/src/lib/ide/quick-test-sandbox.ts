/**
 * The quick-test isolation boundary: a sandboxed iframe with an opaque
 * origin, hosting the worker that runs the step.
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
 * How long the bootstrap gets to say 'ready'. It only has to parse one inline
 * script and open a port, so a quiet three seconds means something — a CSP or
 * an extension blocking the srcdoc script — and the user should hear that,
 * not "the step did not finish".
 */
export const SANDBOX_BOOT_TIMEOUT_MS = 3_000

// Runs inside the opaque origin. It only relays: user code executes in the
// worker, never in this window — and even this window could not reach the
// app's API, which is the point of the opaque origin. A worker error with no
// message is reported as the sandbox being unavailable, because that is what
// an opaque-origin browser refusal to start a worker looks like; a real
// script failure in the same origin carries its message.
const BOOTSTRAP_HTML =
  `<!doctype html><meta charset="utf-8"><script>
window.onmessage = function (e) {
  if (!e.data || e.data.type !== 'init' || !e.ports[0]) return;
  window.onmessage = null;
  var port = e.ports[0];
  var worker;
  try {
    var url = URL.createObjectURL(new Blob([e.data.workerSource], { type: 'text/javascript' }));
    worker = new Worker(url);
  } catch (err) {
    port.postMessage({ type: 'sandbox-unavailable', message: String((err && err.message) || err) });
    return;
  }
  worker.onmessage = function (we) { port.postMessage({ type: 'worker', data: we.data }); };
  worker.onerror = function (we) {
    port.postMessage(
      we.message
        ? { type: 'worker-error', message: we.message }
        : { type: 'sandbox-unavailable', message: 'the worker could not start' },
    );
  };
  port.onmessage = function (pe) {
    if (!pe.data) return;
    if (pe.data.type === 'start') worker.postMessage(pe.data.args);
    if (pe.data.type === 'stop') worker.terminate();
  };
  port.postMessage({ type: 'ready' });
};
</scr` + `ipt>`

interface BootstrapMessage {
  type: 'ready' | 'worker' | 'worker-error' | 'sandbox-unavailable'
  data?: unknown
  message?: string
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
  iframe.srcdoc = BOOTSTRAP_HTML

  const channel = new MessageChannel()
  let pendingArgs: unknown | undefined
  let ready = false
  let destroyed = false

  const bootTimer = setTimeout(() => {
    if (ready || destroyed) return
    callbacks.onUnavailable('the sandbox did not boot — a content security policy may block it')
  }, SANDBOX_BOOT_TIMEOUT_MS)

  channel.port1.onmessage = (event: MessageEvent<BootstrapMessage>) => {
    if (destroyed) return
    const message = event.data
    if (message.type === 'ready') {
      ready = true
      clearTimeout(bootTimer)
      if (pendingArgs !== undefined) {
        channel.port1.postMessage({ type: 'start', args: pendingArgs })
        pendingArgs = undefined
        callbacks.onStarted()
      }
      return
    }
    if (message.type === 'worker') {
      callbacks.onMessage(message.data)
      return
    }
    if (message.type === 'worker-error') {
      callbacks.onLoadError(message.message ?? '')
      return
    }
    callbacks.onUnavailable(message.message ?? 'the sandbox could not start')
  }

  iframe.addEventListener(
    'load',
    () => {
      if (destroyed) return
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
