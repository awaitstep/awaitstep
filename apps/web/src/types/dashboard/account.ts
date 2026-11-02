// Dashboard types for "Your account": the same in every org. The API's
// shapes live in @awaitstep/ir (B10); these add what the pages draw.

import type { OrgRole } from '@awaitstep/ir'
import type { Person } from './session'

export type {
  AccountExport,
  AccountProviders,
  AccountSession,
  SessionDevice,
  SignInMethod,
  SignInProvider,
} from '@awaitstep/ir'

import type { AccountProviders, SignInMethod } from '@awaitstep/ir'

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
  /** The address is confirmed (an email link, or a provider that says so). */
  emailVerified: boolean
  orgs: AccountOrg[]
  /** Why Delete account is off (the orgs the viewer is the only owner of), or null. */
  deleteBlockedReason: string | null
}

export interface ProfileUpdate {
  name?: string
  /** A picked photo to upload (`readPhoto`), or null for the initials. */
  image?: Blob | null
}

/** Sessions and sign-in → Sign-in methods. */
export interface SignInMethods {
  methods: SignInMethod[]
  /** What the instance turns on: with email links the last provider may go. */
  providers: AccountProviders
  /** The account's address: Google and GitHub join it only with this one. */
  email: string
}
