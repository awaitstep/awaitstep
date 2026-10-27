import type { VariableRow } from '../db'
import { ACME } from './orgs'
import { MARKETING, P101 } from './projects'
import { SALES } from './workspaces'

// `ProjectVariables`: Project 101 sets two, Acme Inc three ("5 variables" on
// `EmptyWorkspace` and `NewWorkspace`), and Sales overrides CRM_BASE_URL.
// `OrgResources`: REGION is "Overridden in 1 project" (Marketing site).
export const VARIABLES: VariableRow[] = [
  { level: 'organization', scopeId: ACME, name: 'REGION', value: 'eu', isSecret: false },
  {
    level: 'organization',
    scopeId: ACME,
    name: 'SUPPORT_EMAIL',
    value: 'support@acme.test',
    isSecret: false,
  },
  {
    level: 'organization',
    scopeId: ACME,
    name: 'SENTRY_DSN',
    value: 'https://o1.ingest.sentry.test/42',
    isSecret: true,
  },
  { level: 'project', scopeId: MARKETING, name: 'REGION', value: 'us', isSecret: false },
  { level: 'project', scopeId: P101, name: 'SLACK_TOKEN', value: 'xoxb-dummy', isSecret: true },
  {
    level: 'project',
    scopeId: P101,
    name: 'CRM_BASE_URL',
    value: 'https://crm-staging.acme.test',
    isSecret: false,
  },
  {
    level: 'workspace',
    scopeId: SALES,
    name: 'CRM_BASE_URL',
    value: 'https://crm.acme.test',
    isSecret: false,
  },
]
