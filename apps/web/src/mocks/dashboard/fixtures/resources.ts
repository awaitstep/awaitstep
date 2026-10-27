import type { NodeRow } from '../db'
import { ACME } from './orgs'
import { AMA, TOM } from './people'

// `OrgResources`: the board's fourteen nodes. Acme built two and installed
// four from the marketplace; Slack has a newer version out.

type MarketplaceNode = Pick<NodeRow, 'id' | 'name' | 'category' | 'description' | 'latestVersion'>

const MARKETPLACE: MarketplaceNode[] = [
  {
    id: 'slack',
    name: 'Slack',
    category: 'Messaging',
    description: 'Post messages and alerts to a Slack channel',
    latestVersion: '2.4.0',
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    category: 'AI',
    description: 'Generate text and summaries with Gemini',
    latestVersion: '1.4.0',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payments',
    description: 'Create charges and refunds, look up customers',
    latestVersion: '1.1.2',
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'Messaging',
    description: 'Send transactional email',
    latestVersion: '1.0.3',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'AI',
    description: 'Generate text with Anthropic Claude models via the Messages API',
    latestVersion: '1.2.0',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'AI',
    description: 'Generate text, embeddings and images, and moderate content',
    latestVersion: '1.3.1',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'Data',
    description: 'Create, read and update pages and query databases',
    latestVersion: '1.0.4',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'Data',
    description: 'Manage contacts in HubSpot CRM',
    latestVersion: '1.1.0',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    category: 'Messaging',
    description: 'Send SMS and WhatsApp messages',
    latestVersion: '1.0.2',
  },
  {
    id: 'linear',
    name: 'Linear',
    category: 'Utilities',
    description: 'Create, read, update and list issues in Linear',
    latestVersion: '1.0.1',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'Utilities',
    description: 'Work with GitHub issues and comments',
    latestVersion: '1.2.2',
  },
  {
    id: 'paddle',
    name: 'Paddle',
    category: 'Payments',
    description: 'Manage subscriptions and transactions',
    latestVersion: '1.0.0',
  },
]

/** Acme's installs: the version it runs and how many workflows use it. */
const ACME_INSTALLS: Record<string, { version: string; usage: number }> = {
  slack: { version: '2.3.0', usage: 6 },
  'google-gemini': { version: '1.4.0', usage: 3 },
  stripe: { version: '1.1.2', usage: 2 },
  resend: { version: '1.0.3', usage: 0 },
}

const ACME_CUSTOM: NodeRow[] = [
  {
    orgId: ACME,
    id: 'acme-crm',
    name: 'Acme CRM lookup',
    category: 'Data',
    description: 'Find a company in our CRM by domain',
    source: 'custom',
    authorId: TOM,
    installedVersion: '4',
    latestVersion: '4',
    usage: 5,
  },
  {
    orgId: ACME,
    id: 'acme-audit',
    name: 'Acme audit event',
    category: 'Utilities',
    description: 'Write an entry to our compliance log',
    source: 'custom',
    authorId: AMA,
    installedVersion: '2',
    latestVersion: '2',
    usage: 4,
  },
]

/** Every org sees the marketplace; only Acme has installed or built anything. */
export function seedNodes(orgIds: string[]): NodeRow[] {
  return orgIds.flatMap((orgId) => [
    ...(orgId === ACME ? ACME_CUSTOM : []),
    ...MARKETPLACE.map((node): NodeRow => {
      const install = orgId === ACME ? ACME_INSTALLS[node.id] : undefined
      return {
        ...node,
        orgId,
        source: 'marketplace',
        authorId: null,
        installedVersion: install?.version ?? null,
        usage: install?.usage ?? 0,
      }
    }),
  ])
}
