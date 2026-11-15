import { dashboardImgSrc } from './provider-images.js'

// The dashboard pages' Content-Security-Policy, built here once so the two
// web entries (the Cloudflare Worker and the Node server in front of the SSR
// build) cannot drift apart.

/** The dashboard's outside origins beyond images, each named for what fetches it. */
export const DASHBOARD_POLICY_ORIGINS = {
  // The code editor's type acquisition: package metadata, then `.d.ts` files.
  typeAcquisition: ['https://data.jsdelivr.com', 'https://cdn.jsdelivr.net'],
  // The landing page's handwriting font: the stylesheet, then the font files.
  fontStylesheets: ['https://fonts.googleapis.com'],
  fontFiles: ['https://fonts.gstatic.com'],
} as const

export interface DashboardPolicyOptions {
  /** The API's node registry; its origin may serve node icons. */
  registryUrl?: string
  /** This response's script nonce (see `createCspNonce`). */
  nonce: string
}

const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,}={0,2}$/

/** A fresh, unguessable script nonce: 16 random bytes, base64. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * The policy for a dashboard page. Scripts run only from this origin or
 * when they carry the page's nonce — no inline handlers, no `eval`.
 *
 * `style-src` keeps `'unsafe-inline'`: the server-rendered markup carries
 * `style` attributes (React's `style` prop) and Monaco, React Flow and the
 * toast library inject `<style>` elements at runtime that a nonce cannot
 * reach. Styles cannot run code, so the script policy is what stops injection.
 */
export function dashboardContentSecurityPolicy({
  registryUrl,
  nonce,
}: DashboardPolicyOptions): string {
  // A nonce goes into the header verbatim: anything else could end the
  // source expression and add sources of its own.
  if (!NONCE_PATTERN.test(nonce)) throw new Error('A CSP nonce must be base64')
  const { typeAcquisition, fontStylesheets, fontFiles } = DASHBOARD_POLICY_ORIGINS
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline' ${fontStylesheets.join(' ')}`,
    dashboardImgSrc(registryUrl),
    // `data:`: the build inlines small font files into the stylesheet.
    `font-src 'self' data: ${fontFiles.join(' ')}`,
    `connect-src 'self' ${typeAcquisition.join(' ')}`,
    "worker-src 'self'",
    // The quick-test sandbox: a page of this origin, framed with an opaque origin.
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

const POLICY_HEADER = 'Content-Security-Policy'

/**
 * Renders a dashboard response under the policy: a fresh nonce for
 * `render` to put on the page's scripts, and the same nonce in the header.
 *
 * The response is copied first (the SSR server's may hold immutable
 * headers). One that states a policy of its own keeps it — the quick-test
 * sandbox page is served under a stricter `sandbox` policy instead. Pages
 * that set no caching are marked `private, no-store`.
 */
export async function withDashboardPolicy(
  render: (nonce: string) => Response | Promise<Response>,
  options: { registryUrl?: string } = {},
): Promise<Response> {
  const nonce = createCspNonce()
  const page = await render(nonce)
  const response = new Response(page.body, page)
  if (!response.headers.has(POLICY_HEADER)) {
    response.headers.set(
      POLICY_HEADER,
      dashboardContentSecurityPolicy({ registryUrl: options.registryUrl, nonce }),
    )
  }
  // The page carries this response's nonce (and the viewer's data): a shared
  // cache that kept it would hand both to everyone. A response that set its
  // own caching keeps it.
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'private, no-store')
  }
  return response
}
