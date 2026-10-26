import type { PickedScope } from '../../picked-scopes'
import type { PickerProject } from '../../scope-picks'

// Canvas sample data for InvitePeople and ConnectCloudflare.

export const INVITE_PROJECTS: PickerProject[] = [
  {
    id: 'p101',
    name: 'Project 101',
    workspaces: [
      { id: 'sales', name: 'Sales' },
      { id: 'it', name: 'IT' },
      { id: 'support', name: 'Support' },
    ],
  },
  { id: 'marketing', name: 'Marketing Site', workspaces: [{ id: 'default', name: 'Default' }] },
  { id: 'internal', name: 'Internal Tools', workspaces: [{ id: 'default', name: 'Default' }] },
  {
    id: 'data',
    name: 'Data Platform',
    workspaces: [
      { id: 'ingest', name: 'Ingest' },
      { id: 'reports', name: 'Reports' },
    ],
  },
]

export const CLOUDFLARE_PROJECTS: PickerProject[] = [
  { id: 'p101', name: 'Project 101', meta: '3 workspaces' },
  { id: 'marketing', name: 'Marketing Site', meta: '1 workspace' },
  { id: 'internal', name: 'Internal Tools', meta: '1 workspace' },
  { id: 'billing', name: 'Billing', meta: '1 workspace' },
  { id: 'data', name: 'Data Platform', meta: '4 workspaces' },
  { id: 'mobile', name: 'Mobile App', meta: '2 workspaces' },
]

export const PROJECT_ROLES = [
  { value: 'member', label: 'Project member' },
  { value: 'admin', label: 'Project admin' },
]

export const WORKSPACE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Workspace admin' },
]

export const INVITE_PICKS: PickedScope[] = [
  {
    id: 'ws:p101:it',
    name: 'Project 101 › IT',
    scope: 'Project 101 · workspace only',
    role: 'editor',
    roles: WORKSPACE_ROLES,
  },
  {
    id: 'p:data',
    name: 'Data Platform · every workspace',
    scope: 'Project · all 2 workspaces',
    role: 'member',
    roles: PROJECT_ROLES,
  },
]
