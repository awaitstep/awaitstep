// "Your account" (B10): the same in every organization the person is in. The
// API answers these shapes; the dashboard adds what it draws (initials).

import type { OrgRole } from './access.js'

/** The providers a person can connect. The email link is the account itself. */
export type SignInProvider = 'github' | 'google'

export const SIGN_IN_PROVIDERS: readonly SignInProvider[] = ['github', 'google']

/** Which ways in this instance turns on. */
export interface AccountProviders {
  github: boolean
  google: boolean
  /** The instance sends magic links: the email address alone signs in. */
  emailLink: boolean
}

export interface SignInMethod {
  provider: SignInProvider | 'email'
  connected: boolean
  connectedAt: string | null
  /** The linked account's id, which Disconnect sends better-auth; null while not connected. */
  accountId: string | null
}

/** An organization on the Profile page's list. */
export interface ApiAccountOrg {
  id: string
  slug: string
  name: string
  logo: string | null
  role: OrgRole
  projectCount: number
  /** The person is its only owner: they can't leave or delete their account until someone else is. */
  onlyOwner: boolean
}

export interface ApiAccount {
  person: { id: string; name: string; email: string; image: string | null; emailVerified: boolean }
  orgs: ApiAccountOrg[]
  /** Why Delete account is off, or null. */
  deleteBlockedReason: string | null
  /** One row per provider the instance turns on, plus the email link when it sends them. */
  signInMethods: SignInMethod[]
  providers: AccountProviders
}

export type SessionDevice = 'desktop' | 'phone' | 'terminal'

export interface AccountSession {
  id: string
  /** "Chrome on macOS". */
  device: string
  kind: SessionDevice
  /** Masked: "81.2.69.x", or null when none was known. */
  ip: string | null
  signedInAt: string
  activeAt: string
  current: boolean
}

/** Download JSON's content: the person's own rows, nothing the organizations own. */
export interface AccountExport {
  exportedAt: string
  profile: { name: string; email: string; photo: boolean }
  signInMethods: SignInMethod[]
  sessions: AccountSession[]
  memberships: {
    organization: string
    role: OrgRole
    projects: { name: string; role: string }[]
    workspaces: { project: string; name: string; role: string }[]
  }[]
}

/** "You're the only owner of Acme Inc and Bolt Labs", or null. */
export function deleteBlockedReason(soleOwnedOrgNames: readonly string[]): string | null {
  if (soleOwnedOrgNames.length === 0) return null
  const names =
    soleOwnedOrgNames.length === 1
      ? soleOwnedOrgNames[0]
      : `${soleOwnedOrgNames.slice(0, -1).join(', ')} and ${soleOwnedOrgNames.at(-1)}`
  return `You're the only owner of ${names}`
}

/** Why the last way in can't be disconnected; deleting the account is the way out. */
export const ONLY_WAY_IN = 'Your only way to sign in. To remove it, delete your account.'

/**
 * Whether a connected provider may be disconnected: while the email link
 * signs in, or another connected provider the instance still turns on does.
 * A provider the instance turned off is listed but signs no one in.
 */
export function canDisconnect(
  methods: readonly SignInMethod[],
  provider: SignInProvider,
  providers: AccountProviders,
): boolean {
  const connected = methods.filter(
    (m): m is SignInMethod & { provider: SignInProvider } => m.provider !== 'email' && m.connected,
  )
  if (!connected.some((m) => m.provider === provider)) return false
  return (
    providers.emailLink || connected.some((m) => m.provider !== provider && providers[m.provider])
  )
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bCriOS\/|\bChrome\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string, SessionDevice][] = [
  [/\biPhone\b|\biPod\b/, 'iOS', 'phone'],
  [/\biPad\b/, 'iPadOS', 'phone'],
  [/\bAndroid\b/, 'Android', 'phone'],
  [/\bWindows\b/, 'Windows', 'desktop'],
  [/\bCrOS\b/, 'ChromeOS', 'desktop'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS', 'desktop'],
  [/\bLinux\b/, 'Linux', 'desktop'],
]

const TERMINALS: [RegExp, string][] = [
  [/^curl\//i, 'curl'],
  [/^Wget\//i, 'Wget'],
  [/^node-fetch|^undici|^node\b/i, 'Node.js'],
  [/^python-requests|^python-urllib|^aiohttp/i, 'Python'],
  [/^awaitstep/i, 'AwaitStep CLI'],
]

/** A session's user agent as the Sessions page lists it: "Chrome on macOS". */
export function describeUserAgent(userAgent: string | null | undefined): {
  device: string
  kind: SessionDevice
} {
  const ua = userAgent?.trim() ?? ''
  if (!ua) return { device: 'Unknown device', kind: 'desktop' }
  const terminal = TERMINALS.find(([pattern]) => pattern.test(ua))
  if (terminal) return { device: terminal[1], kind: 'terminal' }
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))
  if (!browser && !system) return { device: 'Unknown device', kind: 'desktop' }
  const kind = system?.[2] ?? 'desktop'
  if (!browser) return { device: system![1], kind }
  return { device: system ? `${browser} on ${system[1]}` : browser, kind }
}
