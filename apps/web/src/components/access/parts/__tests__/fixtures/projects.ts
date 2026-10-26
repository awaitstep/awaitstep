import type { AccessDraft, AccessProject } from '../../../../../types/dashboard/access'

// Canvas sample data for the AccessEditor board (Daniel Kim in Acme Inc).

export const ACCESS_PROJECTS: AccessProject[] = [
  {
    id: 'p101',
    name: 'Project 101',
    initial: 'P',
    workspaces: [
      { id: 'sales', slug: 'sales', name: 'Sales', colour: 'green' },
      { id: 'it', slug: 'it', name: 'IT', colour: 'blue' },
      { id: 'support', slug: 'support', name: 'Support', colour: 'amber' },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing Site',
    initial: 'M',
    workspaces: [{ id: 'm-default', slug: 'default', name: 'Default', colour: 'amber' }],
  },
  {
    id: 'internal',
    name: 'Internal Tools',
    initial: 'I',
    workspaces: [{ id: 'i-default', slug: 'default', name: 'Default', colour: 'purple' }],
  },
]

/** The board's starting state: Editor in Sales and nothing else. */
export const DANIEL_ACCESS: AccessDraft = {
  orgRole: 'member',
  projects: {},
  workspaces: { sales: 'editor' },
}
