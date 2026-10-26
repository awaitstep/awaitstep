import { Building2, Layers, LayoutGrid, Plus, Settings } from 'lucide-react'
import type { ScopeAction, ScopeGroup } from '../../scope-switcher'

// Canvas sample data for the three switchers (SwitcherProject,
// SwitcherWorkspace, OrgSwitcher), shared by stories and tests.

export const PROJECT_GROUPS: ScopeGroup[] = [
  {
    label: 'Acme Inc projects',
    items: [
      {
        id: 'project-101',
        name: 'Project 101',
        detail: '3 workspaces · Sales, IT, Support · opens in Sales',
        tile: { initial: 'P' },
      },
      { id: 'marketing', name: 'Marketing Site', detail: '1 workspace', tile: { initial: 'M' } },
      { id: 'internal', name: 'Internal Tools', detail: '1 workspace', tile: { initial: 'I' } },
    ],
  },
]

export const PROJECT_ACTIONS: ScopeAction[] = [
  { id: 'new-project', label: 'New project', icon: Plus, tone: 'primary' },
  { id: 'all-projects', label: 'All projects', icon: LayoutGrid },
]

export const WORKSPACE_GROUPS: ScopeGroup[] = [
  {
    label: 'Workspaces in Project 101',
    items: [
      {
        id: 'sales',
        name: 'Sales',
        detail: '4 workflows · 4 members',
        tile: { initial: 'S', colour: 'green' },
      },
      {
        id: 'it',
        name: 'IT',
        detail: '4 workflows · 3 members',
        tile: { initial: 'I', colour: 'blue' },
      },
      {
        id: 'support',
        name: 'Support',
        detail: 'New · nothing built yet',
        tile: { initial: 'S', colour: 'amber' },
      },
    ],
  },
]

export const WORKSPACE_ACTIONS: ScopeAction[] = [
  { id: 'new-workspace', label: 'New workspace', icon: Plus, tone: 'primary' },
  { id: 'manage-workspaces', label: 'Manage workspaces', icon: Layers },
]

export const ORG_GROUPS: ScopeGroup[] = [
  {
    label: 'Organizations',
    items: [
      {
        id: 'acme',
        name: 'Acme Inc',
        detail: 'Owner · 3 projects · 6 members',
        tile: { initial: 'A', colour: 'green' },
      },
      {
        id: 'bolt',
        name: 'Bolt Labs',
        detail: 'Member · invited last week',
        tile: { initial: 'B', colour: 'blue' },
      },
    ],
  },
]

export const ORG_ACTIONS: ScopeAction[] = [
  { id: 'new-org', label: 'New organization', icon: Building2, tone: 'primary' },
  { id: 'org-settings', label: 'Acme Inc settings', icon: Settings },
]

export const MANY_PROJECT_GROUPS: ScopeGroup[] = [
  {
    label: 'Acme Inc projects',
    items: Array.from({ length: 30 }, (_, i) => ({
      id: `project-${i + 1}`,
      name: `Project ${i + 1}`,
      detail: '1 workspace',
      tile: { initial: 'P' },
    })),
  },
]
