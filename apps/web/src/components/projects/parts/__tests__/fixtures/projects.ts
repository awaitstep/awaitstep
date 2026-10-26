import type { Project } from '../../../../../types/dashboard/projects'
import type { Person } from '../../../../../types/dashboard/session'

// Canvas sample data for the Main board's project cards. Times are relative
// to when the module loads, so "5 minutes ago" stays 5 minutes ago.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function person(id: string, name: string, initials: string): Person {
  return { id, name, initials, email: `${id}@acme.test` }
}

const AMA = person('ama', 'Ama Mensah', 'AM')
const DANIEL = person('daniel', 'Daniel Kim', 'DK')
const LENA = person('lena', 'Lena Ortiz', 'LO')
const PRIYA = person('priya', 'Priya Shah', 'PS')
const TOM = person('tom', 'Tom Becker', 'TB')
const JONAS = person('jonas', 'Jonas Ruiz', 'JR')

const NO_LOCK = { own: null, inherited: null }

function project(
  id: string,
  name: string,
  description: string,
  rest: Pick<Project, 'workspaces' | 'people' | 'health'>,
): Project {
  return {
    id,
    organizationId: 'org_acme',
    name,
    slug: id,
    description,
    initial: name.charAt(0),
    createdAt: minutesAgo(60 * 24 * 100),
    updatedAt: minutesAgo(60 * 24 * 3),
    lock: NO_LOCK,
    ...rest,
  }
}

export const PROJECT_101 = project('project-101', 'Project 101', 'Sales and IT automations', {
  workspaces: [
    { id: 'sales', slug: 'sales', name: 'Sales', colour: 'green' },
    { id: 'it', slug: 'it', name: 'IT', colour: 'blue' },
    { id: 'support', slug: 'support', name: 'Support', colour: 'amber' },
  ],
  people: [AMA, DANIEL, LENA, PRIYA, TOM, JONAS],
  health: { workflows: 8, failing: 1, lastRunAt: minutesAgo(5) },
})

export const MARKETING_SITE = project(
  'marketing-site',
  'Marketing Site',
  'Forms, newsletters, CMS hooks',
  {
    workspaces: [{ id: 'm-default', slug: 'default', name: 'Default', colour: 'amber' }],
    people: [AMA, LENA, JONAS],
    health: { workflows: 4, failing: 0, lastRunAt: minutesAgo(180) },
  },
)

export const NEW_PROJECT = project('billing', 'Billing', 'Invoices and dunning', {
  workspaces: [{ id: 'b-default', slug: 'default', name: 'Default', colour: 'green' }],
  people: [AMA],
  health: { workflows: 0, failing: 0, lastRunAt: null },
})
