import type { WorkspaceColour } from '../../workspace-colour'

// Canvas sample data (Sales in Project 101) shared by the access stories and tests.

export type KeyLevel = 'org' | 'project' | 'workspace'

export const KEY_LEVELS: {
  value: KeyLevel
  title: string
  description: string
  colour?: WorkspaceColour
}[] = [
  {
    value: 'org',
    title: 'Organization',
    description: 'Acme Inc admin only. No workflow access.',
    colour: 'purple',
  },
  { value: 'project', title: 'Project 101', description: 'Every workspace in the project.' },
  {
    value: 'workspace',
    title: 'One workspace',
    description: 'Pick it below. Nothing else in Project 101.',
    colour: 'green',
  },
]

export type WorkspaceAccess = 'admins' | 'pick'

export const WORKSPACE_ACCESS: { value: WorkspaceAccess; title: string; description: string }[] = [
  {
    value: 'admins',
    title: 'Only project admins for now',
    description: 'Add people from Workspace settings later',
  },
  {
    value: 'pick',
    title: 'Choose people now',
    description: "They'll see Support and nothing else in Project 101",
  },
]

export interface SampleMember {
  id: string
  initials: string
  name: string
  email: string
  role: string
  active: string
}

export const SALES_MEMBERS: SampleMember[] = [
  {
    id: 'daniel',
    initials: 'DK',
    name: 'Daniel Kim',
    email: 'daniel@acme.test',
    role: 'Editor',
    active: 'Active 2h ago',
  },
  {
    id: 'priya',
    initials: 'PS',
    name: 'Priya Shah',
    email: 'priya@acme.test',
    role: 'Viewer',
    active: 'Active yesterday',
  },
]

export const PROJECT_ADMINS: SampleMember[] = [
  {
    id: 'ama',
    initials: 'AM',
    name: 'Ama Mensah (you)',
    email: 'ama@acme.test',
    role: 'Project admin',
    active: 'Active now',
  },
  {
    id: 'tom',
    initials: 'TB',
    name: 'Tom Becker',
    email: 'tom@acme.test',
    role: 'Project admin',
    active: 'Active 1h ago',
  },
]

export interface SampleKey {
  id: string
  name: string
  prefix: string
  permissions: string[]
  createdBy: string
  lastUsed: string
  expires: string
}

export const SALES_KEYS: SampleKey[] = [
  {
    id: 'crm',
    name: 'CRM webhook',
    prefix: 'ask_sl…9f2c',
    permissions: ['Workflows: read · run'],
    createdBy: 'Ama Mensah',
    lastUsed: '1h ago',
    expires: 'In 80 days',
  },
]

export const PROJECT_KEYS: SampleKey[] = [
  {
    id: 'ci',
    name: 'CI deploys',
    prefix: 'ask_Kq3VtR8m…a71d',
    permissions: ['Workflows: read · deploy', 'Runs: read'],
    createdBy: 'Tom Becker',
    lastUsed: '22m ago',
    expires: 'Never',
  },
]

export const LOCK_SET_BY = { name: 'Ama Mensah', date: '12 Oct' }

export const SAMPLE_SECRET = 'ask_p1_7Kq2vX9mR4tWp8LzN3bY6cHs1Jd5Fg0e'
