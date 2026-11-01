/** What went wrong on the sign-in page, in the four ways SignIn shows (the board's error states). */
export type SignInProblem =
  { kind: 'provider' } | { kind: 'expired' } | { kind: 'rate' } | { kind: 'failed'; detail: string }

/** `?error=` values better-auth sends when an email link is expired or already used. */
const LINK_CODES = new Set(['EXPIRED_TOKEN', 'INVALID_TOKEN'])

/** An `?error=` value kept to the characters a code has, so nothing typed into the address bar is shown. */
export function cleanErrorCode(value: unknown): string | undefined {
  // The router reads `?error=true` as the boolean `true`, and `?error=7` as a number.
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined
  }
  if (value === false) return undefined
  const code = String(value)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64)
  return code || undefined
}

/** Where a failed sign-in comes back with `?error=<code>`; `null` when nothing failed. */
export function problemFromCode(code: unknown): SignInProblem | null {
  const clean = cleanErrorCode(code)
  if (!clean) return null
  return LINK_CODES.has(clean.toUpperCase()) ? { kind: 'expired' } : { kind: 'provider' }
}

export interface ProblemCopy {
  title: string
  body: string
}

/** The alert's words. The link lifetime is Better Auth's 300 s, not the board's 10 minutes. */
export function problemCopy(problem: SignInProblem, emailAvailable: boolean): ProblemCopy {
  switch (problem.kind) {
    case 'provider':
      return {
        title: 'That sign-in didn’t finish',
        body: `You were sent back before approving it, so no account was created or changed. Try again${emailAvailable ? ', or use your email below' : ''}.`,
      }
    case 'expired':
      return {
        title: 'That sign-in link has expired',
        body: 'Links last 5 minutes and work only once. Ask for a new one below — we’ll send it to the same address.',
      }
    case 'rate':
      return {
        title: 'Too many sign-in links',
        body: 'You’ve asked for too many in a short time. This limit is there to stop someone else filling your inbox.',
      }
    case 'failed':
      return { title: 'Couldn’t sign you in', body: problem.detail }
  }
}

/** "1:58" for a number of seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The shape check before a link is requested; the server decides whether the address exists. */
export function looksLikeEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim())
}
