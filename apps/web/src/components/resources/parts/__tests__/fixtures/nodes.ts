import type { OrgNode } from '../../../../../types/dashboard/resources'

// Canvas sample data for the OrgResources board.

export const ACME_CRM: OrgNode = {
  id: 'acme-crm',
  name: 'Acme CRM lookup',
  category: 'Data',
  description: 'Find a company in our CRM by domain',
  version: '4',
  source: 'custom',
  author: 'Tom Becker',
  installed: true,
  usage: 5,
  updateAvailable: false,
}

export const SLACK: OrgNode = {
  id: 'slack',
  name: 'Slack',
  category: 'Messaging',
  description: 'Post messages and alerts to a Slack channel',
  version: '2.3.0',
  source: 'marketplace',
  installed: true,
  usage: 6,
  updateAvailable: true,
}

export const RESEND: OrgNode = {
  id: 'resend',
  name: 'Resend',
  category: 'Messaging',
  description: 'Send transactional email',
  version: '1.0.3',
  source: 'marketplace',
  installed: true,
  usage: 0,
  updateAvailable: false,
}

export const ANTHROPIC: OrgNode = {
  id: 'anthropic',
  name: 'Anthropic',
  category: 'AI',
  description: 'Generate text with Anthropic Claude models via the Messages API',
  version: '1.2.0',
  source: 'marketplace',
  installed: false,
  updateAvailable: false,
}
