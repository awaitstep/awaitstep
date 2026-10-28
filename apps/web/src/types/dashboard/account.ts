// Dashboard types for "Your account": the same in every org (P10). Web-only
// until B10 moves them next to better-auth.

import type { OrgRole, Person } from './session'

/** An org on the Profile page's Organizations list. */
export interface AccountOrg {
  id: string
  slug: string
  name: string
  initial: string
  logo: string | null
  role: OrgRole
  projectCount: number
  /** The viewer is its only owner: they can't leave until someone else is. */
  onlyOwner: boolean
}

export interface Account {
  person: Person
  /** A new address waiting for its confirmation link; the email stays until then. */
  pendingEmail: string | null
  orgs: AccountOrg[]
  /** Why Delete account is off (the orgs the viewer is the only owner of), or null. */
  deleteBlockedReason: string | null
}

export interface ProfileUpdate {
  name?: string
  /** An uploaded photo (data URL), or null for the initials. */
  image?: string | null
}

export type SignInProvider = 'github' | 'google'

export interface SignInMethod {
  provider: SignInProvider | 'email'
  /** The linked account ("ama-mensah"), or null while not connected. Email is always on. */
  account: string | null
  connectedAt: string | null
}

export type SessionDevice = 'desktop' | 'phone' | 'terminal'

export interface AccountSession {
  id: string
  /** "Chrome on macOS". */
  device: string
  kind: SessionDevice
  /** Masked: "81.2.69.x". */
  ip: string
  signedInAt: string
  activeAt: string
  current: boolean
}

/** Download JSON's content: everything the account holds. */
export interface AccountExport {
  exportedAt: string
  profile: { name: string; email: string; pendingEmail: string | null; photo: boolean }
  signInMethods: SignInMethod[]
  sessions: AccountSession[]
  memberships: { organization: string; role: OrgRole }[]
}
