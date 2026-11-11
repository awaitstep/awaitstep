import type { ComponentType } from 'react'
import type { ProjectSlugs } from '../../../lib/dashboard-paths'
import type { NewProjectConnectionInput } from '../../../types/dashboard/project-connections'
import { CloudflareConnect } from './cloudflare-connect'
import { CloudflareLogo } from './cloudflare-logo'

/** What a provider's connect step is given by the dialog around it. */
export interface ConnectStepProps {
  /** The dialog's footer submits the form with this id. */
  formId: string
  slugs: ProjectSlugs
  pending: boolean
  /** The message for a field the server refused, else undefined. */
  errorOn: (field: string) => string | undefined
  /** Called with the account's details; the dialog adds the rest and connects it. */
  onSubmit: (input: Omit<NewProjectConnectionInput, 'makeDefault'>) => void
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

/** The providers "Connect a new account" offers, in order. A new one is one entry here. */
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
