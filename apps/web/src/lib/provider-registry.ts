import { Cloud, type LucideIcon } from 'lucide-react'

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password'
  placeholder: string
  minLength?: number
}

export interface ProviderPermission {
  scope: string
  resource: string
  level: string
}

export interface ProviderDefinition {
  id: string
  name: string
  description: string
  icon: LucideIcon
  enabled: boolean
  credentialFields: CredentialField[]
  permissions: ProviderPermission[]
  tokenCreateUrl?: string
  tokenCreateLabel?: string
  verifyReturnsAccounts: boolean
}

const providers: ProviderDefinition[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Deploy durable workflows on Cloudflare Workers',
    icon: Cloud,
    enabled: true,
    credentialFields: [
      {
        key: 'apiToken',
        label: 'API Token',
        type: 'password',
        placeholder: 'Paste your Cloudflare API token',
        minLength: 20,
      },
    ],
    permissions: [
      { scope: 'Account', resource: 'Workers Scripts', level: 'Edit' },
      { scope: 'Account', resource: 'Workers Workflows', level: 'Edit' },
      { scope: 'Account', resource: 'Workers KV Storage', level: 'Edit' },
      { scope: 'Account', resource: 'Workers R2 Storage', level: 'Read' },
      { scope: 'Account', resource: 'D1', level: 'Edit' },
    ],
    tokenCreateUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    tokenCreateLabel: 'Create token on Cloudflare',
    verifyReturnsAccounts: true,
  },
]

export function getProvider(id: string): ProviderDefinition | undefined {
  return providers.find((p) => p.id === id)
}

export function getEnabledProviders(): ProviderDefinition[] {
  return providers.filter((p) => p.enabled)
}
