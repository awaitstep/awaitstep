import type { Person } from '../../../../../types/dashboard/session'
import type { Workspace, WorkspaceCounts } from '../../../../../types/dashboard/workspaces'

// Canvas sample data for the ProjectOverview board's workspace cards. Times are
// relative to when the module loads.

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

function person(id: string, name: string, initials: string): Person {
  return { id, name, initials, email: `${id}@acme.test`, image: null }
}

const AMA = person('ama', 'Ama Mensah', 'AM')
const DANIEL = person('daniel', 'Daniel Kim', 'DK')
const LENA = person('lena', 'Lena Ortiz', 'LO')
const PRIYA = person('priya', 'Priya Shah', 'PS')
const TOM = person('tom', 'Tom Becker', 'TB')

function workspace(
  id: string,
  name: string,
  colour: Workspace['colour'],
  description: string,
  people: Person[],
  counts: WorkspaceCounts,
): Workspace {
  return {
    id,
    projectId: 'project-101',
    slug: id,
    name,
    initial: name.charAt(0),
    description,
    colour,
    people,
    createdAt: minutesAgo(60 * 24 * 60),
    createdBy: { id: AMA.id, name: AMA.name },
    lock: { own: null, inherited: null },
    counts,
    viewerCanEdit: true,
  }
}

export const SALES = workspace(
  'sales',
  'Sales',
  'green',
  'Lead handling and pipeline reports',
  [AMA, DANIEL, PRIYA, TOM],
  {
    workflows: 4,
    deployed: 4,
    functions: 2,
    sharedOut: 1,
    runs24h: 40,
    failing: 1,
    lastRunAt: minutesAgo(5),
  },
)

export const IT = workspace(
  'it',
  'IT',
  'blue',
  'Accounts, alerts and provisioning',
  [AMA, LENA, TOM],
  {
    workflows: 4,
    deployed: 4,
    functions: 1,
    sharedOut: 2,
    runs24h: 12,
    failing: 0,
    lastRunAt: minutesAgo(60),
  },
)

export const SUPPORT = workspace(
  'support',
  'Support',
  'amber',
  'Created today by Ama Mensah',
  [AMA, TOM],
  {
    workflows: 0,
    deployed: 0,
    functions: 0,
    sharedOut: 0,
    runs24h: 0,
    failing: 0,
    lastRunAt: null,
  },
)
