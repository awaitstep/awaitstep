import type { ComponentType } from 'react'
import { CloudflareConnect } from './cloudflare-connect'
import { CloudflareLogo } from './cloudflare-logo'

/** Where a new account is added: the organization's Connections, or one project's. */
export interface NewAccountPlace {
  org: string
  /** Set when the account becomes that project's own. */
  project?: string
}

/** What any provider's form hands back: the account's name and its credentials. */
export interface NewAccountDetails {
  name: string
  accountId: string
  token: string
}

/** What a provider's connect step is given by the dialog around it. */
export interface ConnectStepProps {
  /** The dialog's footer submits the form with this id. */
  formId: string
  place: NewAccountPlace
  pending: boolean
  /** The message for a field the server refused, else undefined. */
  errorOn: (field: string) => string | undefined
  /** Called with the account's details; the dialog adds the rest (projects, default) and connects it. */
  onSubmit: (details: NewAccountDetails) => void
  /** Any edit clears the last refusal. */
  onEdit: () => void
}

/** A provider an account can be connected from: how it is offered, and its connect step. */
export interface NewAccountProvider {
  id: string
  name: string
  description: string
  /** The provider's own logo (an SVG component), when there is one; no generic stand-in. */
  icon?: ComponentType<{ className?: string }>
  /** The footer's button while this provider's step is open. */
  submitLabel: (pending: boolean) => string
  Connect: ComponentType<ConnectStepProps>
}

/** The providers Add account offers, on the org's and a project's Connections, in order. A new one is one entry here. */
export const NEW_ACCOUNT_PROVIDERS: NewAccountProvider[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare.com',
    description: 'Deploy to Workers on your Cloudflare account.',
    icon: CloudflareLogo,
    submitLabel: (pending) => (pending ? 'Checking token…' : 'Check token and connect'),
    Connect: CloudflareConnect,
  },
]
