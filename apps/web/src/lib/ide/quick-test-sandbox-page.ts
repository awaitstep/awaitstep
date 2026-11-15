/**
 * The quick-test sandbox's own page, served by the web app at
 * `QUICK_TEST_SANDBOX_PATH` (`routes/quick-test-sandbox[.]html.ts`).
 *
 * A page of its own rather than an `srcdoc` document because an `srcdoc`
 * frame inherits the dashboard's Content-Security-Policy: its bootstrap
 * script would need the dashboard's nonce, and the step's worker would
 * inherit `connect-src` — a quick-tested step could no longer call the APIs
 * it exists to call. This page is served with a policy of its own instead,
 * `sandbox allow-scripts`, so the browser gives it an opaque origin however
 * it is opened — framed by the dashboard or navigated to directly.
 */

// A dot no slug can hold: the path never shadows an organization's URL.
export const QUICK_TEST_SANDBOX_PATH = '/quick-test-sandbox.html'

/**
 * Opaque origin always (the header repeats the iframe's `sandbox`
 * attribute), and only the dashboard may frame it. Scripts and connections
 * are otherwise unrestricted: the worker inherits this policy, and a step's
 * outbound calls are the point of a quick test.
 */
export const QUICK_TEST_SANDBOX_POLICY = "sandbox allow-scripts; frame-ancestors 'self'"

// Runs inside the opaque origin. It only relays: user code executes in the
// worker, never in this window — and even this window could not reach the
// app's API, which is the point of the opaque origin. Worker errors are
// relayed as they come, an empty message included; the page decides what an
// undescribed one means. It does nothing at all unless its origin really is
// opaque: should the page ever be served without its sandbox policy, it must
// not run code it is sent on the app's own origin. Only its parent may start
// it — frame-ancestors keeps that to the dashboard — so a site that opens the
// page itself, or posts into the dashboard's frames, cannot run code here or
// take the dashboard's place before its own init arrives.
export const QUICK_TEST_SANDBOX_HTML =
  `<!doctype html><meta charset="utf-8"><title>Quick test</title><script>
if (window.origin === 'null') window.onmessage = function (e) {
  if (window.parent === window || e.source !== window.parent) return;
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
    port.postMessage({ type: 'worker-error', message: we.message || '' });
  };
  port.onmessage = function (pe) {
    if (!pe.data) return;
    if (pe.data.type === 'start') worker.postMessage(pe.data.args);
    if (pe.data.type === 'stop') worker.terminate();
  };
  port.postMessage({ type: 'ready' });
};
</scr` + `ipt>`

/** A short fingerprint of a page: FNV-1a, base 36. Not a security measure — a cache key. */
export function sandboxPageVersion(html: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < html.length; i++) {
    hash = Math.imul(hash ^ html.charCodeAt(i), 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** This build's sandbox page, fingerprinted by its content. */
export const QUICK_TEST_SANDBOX_VERSION = sandboxPageVersion(QUICK_TEST_SANDBOX_HTML)

/**
 * What the iframe loads: the path plus the page's fingerprint, so the URL
 * changes whenever a deploy changes the page and a cached copy can never
 * outlive its bundle.
 */
export const QUICK_TEST_SANDBOX_SRC = `${QUICK_TEST_SANDBOX_PATH}?v=${QUICK_TEST_SANDBOX_VERSION}`

/**
 * The fingerprinted URL may be cached: a new page comes with a new URL, so
 * the length only bounds how long a cache keeps a version nobody asks for —
 * a day. It holds nothing private (`public`). Any other URL (an older
 * bundle's fingerprint, none at all) revalidates every time: its content is
 * not the one its key names.
 */
export const QUICK_TEST_SANDBOX_CACHE = 'public, max-age=86400, immutable'

/** The sandbox page's response, under its own policy. */
export function quickTestSandboxResponse(request?: Request): Response {
  const version = request ? new URL(request.url).searchParams.get('v') : null
  return new Response(QUICK_TEST_SANDBOX_HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': QUICK_TEST_SANDBOX_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control':
        version === QUICK_TEST_SANDBOX_VERSION ? QUICK_TEST_SANDBOX_CACHE : 'no-cache',
    },
  })
}
