/**
 * A path inside this app to return to after signing in, or undefined. Only
 * same-origin paths pass, so `?redirect=` can't send anyone to another site.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined
  return value
}

/** Whether `path` is an invite page (`/invite/<token>`, query allowed): signing in there is to accept it. */
export function isInvitePath(path: string | null | undefined): boolean {
  return typeof path === 'string' && /^\/invite\/[^/?#]+(?:[?#].*)?$/.test(path)
}

/** The sign-in page, coming back to `returnTo` afterwards. */
export function signInPath(returnTo?: string): string {
  const back = safeRedirectPath(returnTo)
  return back ? `/sign-in?${new URLSearchParams({ redirect: back })}` : '/sign-in'
}
