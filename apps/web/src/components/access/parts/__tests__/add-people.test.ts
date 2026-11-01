import { describe, expect, it } from 'vitest'
import type { ProjectMembers } from '../../../../types/dashboard/access'
import type { Person } from '../../../../types/dashboard/session'
import type { WorkspacePerson } from '../../../../types/dashboard/workspaces'
import {
  doneCopy,
  doneLine,
  submitLabel,
  summaryText,
  type AddPeopleContext,
  type Pick,
} from '../add-people-copy'
import { inviteCandidate, matchPool, projectPool, workspacePool } from '../people-pool'

function person(id: string, name: string): Person {
  return { id, name, email: `${id}@acme.test`, initials: name.slice(0, 2), image: null }
}

const lena = person('lena', 'Lena Ortiz')
const priya = person('priya', 'Priya Shah')
const sam = person('sam', 'Sam Hall')
const tom = person('tom', 'Tom Becker')
const daniel = person('daniel', 'Daniel Kim')

const it_ = { id: 'ws-it', slug: 'it', name: 'IT', colour: 'blue' as const }
const sales = { id: 'ws-sales', slug: 'sales', name: 'Sales', colour: 'green' as const }

const members: ProjectMembers = {
  wholeProject: [
    { person: tom, role: 'project-admin' },
    { person: priya, role: 'project-member' },
  ],
  workspacesOnly: [
    { person: lena, workspaces: [{ workspace: it_, role: 'editor' }] },
    { person: daniel, workspaces: [{ workspace: sales, role: 'editor' }] },
  ],
}

const inSales: WorkspacePerson[] = [
  {
    person: tom,
    role: 'admin',
    inherited: true,
    lastActiveAt: null,
    projectRole: 'admin',
    orgRole: null,
  },
  {
    person: daniel,
    role: 'editor',
    inherited: false,
    lastActiveAt: null,
    projectRole: null,
    orgRole: null,
  },
]

const org = [lena, priya, sam, tom, daniel]

describe('workspacePool (21b)', () => {
  it('marks who has access, who is in the project, and who joins it too', () => {
    const pool = workspacePool({
      orgPeople: org,
      members,
      workspacePeople: inSales,
      orgName: 'Acme Inc',
      projectName: 'Project 101',
    })
    expect(pool.map((p) => [p.person.name, p.tier, p.note, p.joins])).toEqual([
      ['Lena Ortiz', 'project', 'In Project 101 · IT', false],
      ['Priya Shah', 'project', 'In Project 101', false],
      ['Sam Hall', 'org', 'In Acme Inc, not in Project 101', true],
      ['Tom Becker', 'has', 'Already has access · whole project', false],
      ['Daniel Kim', 'has', 'Already has access · Editor', false],
    ])
  })
})

describe('projectPool (21a)', () => {
  it('marks who is already in the project and how, and shows the rest by email', () => {
    const pool = projectPool({ orgPeople: org, members })
    expect(pool.map((p) => [p.person.name, p.tier, p.note])).toEqual([
      ['Lena Ortiz', 'has', 'Already in this project · IT'],
      ['Priya Shah', 'has', 'Already in this project · Member'],
      ['Sam Hall', 'org', 'sam@acme.test'],
      ['Tom Becker', 'has', 'Already in this project · Project admin'],
      ['Daniel Kim', 'has', 'Already in this project · Sales'],
    ])
  })
})

describe('matchPool and inviteCandidate', () => {
  const pool = projectPool({ orgPeople: org, members })

  it('filters by name or email', () => {
    expect(matchPool(pool, 'SAM').map((p) => p.person.id)).toEqual(['sam'])
    expect(matchPool(pool, 'tom@').map((p) => p.person.id)).toEqual(['tom'])
    expect(matchPool(pool, ' ')).toHaveLength(5)
  })

  it('offers an invite only for a full, new, unpicked address', () => {
    expect(inviteCandidate('jo@new.test', pool, [])).toBe('jo@new.test')
    expect(inviteCandidate('Jo@New.test ', pool, [])).toBe('jo@new.test')
    expect(inviteCandidate('jo@new', pool, [])).toBeNull()
    expect(inviteCandidate('sam@acme.test', pool, [])).toBeNull()
    expect(inviteCandidate('jo@new.test', pool, ['jo@new.test'])).toBeNull()
  })
})

const workspaceCtx: AddPeopleContext = {
  kind: 'workspace',
  orgName: 'Acme Inc',
  projectName: 'Project 101',
  roleLabel: 'Editor',
  where: 'Sales',
}

const pickSam: Pick = {
  kind: 'person',
  entry: { person: sam, tier: 'org', note: '', joins: true },
}
const pickPriya: Pick = {
  kind: 'person',
  entry: { person: priya, tier: 'project', note: '', joins: false },
}
const pickJo: Pick = { kind: 'email', email: 'jo@new.test' }

describe('summaryText', () => {
  it('says nothing changes elsewhere before anyone is picked', () => {
    expect(summaryText([], workspaceCtx)).toMatch(/never changes what they can see/)
    expect(summaryText([], { ...workspaceCtx, kind: 'project' })).toMatch(
      /Anyone you add can open only what you choose here/,
    )
  })

  it('names the role and place, who joins the project, and who is new', () => {
    expect(summaryText([pickPriya, pickSam, pickJo], workspaceCtx)).toBe(
      '3 people get Editor in Sales. Sam isn’t in Project 101 yet, so this brings them in with Sales only. jo@new.test is new to Acme Inc and joins as a Member once the invite is accepted, with nothing beyond this.',
    )
  })

  it('never says someone joins the project from the project’s own dialog', () => {
    expect(summaryText([pickSam], { ...workspaceCtx, kind: 'project' })).toBe(
      '1 person gets Editor in Sales.',
    )
  })
})

describe('submitLabel', () => {
  it('counts people, or invites when every pick is an address', () => {
    expect(submitLabel([])).toBe('Add people')
    expect(submitLabel([pickSam])).toBe('Add 1 person')
    expect(submitLabel([pickSam, pickJo])).toBe('Add 2 people')
    expect(submitLabel([pickJo])).toBe('Send invite')
    expect(submitLabel([pickJo, { kind: 'email', email: 'x@new.test' }])).toBe('Send 2 invites')
  })
})

describe('done state and toast', () => {
  it('heads the done state by what went through', () => {
    expect(doneCopy([{ key: 'a', result: 'added' }], workspaceCtx).title).toBe('Added')
    expect(
      doneCopy(
        [
          { key: 'a', result: 'added' },
          { key: 'b', result: 'added' },
        ],
        workspaceCtx,
      ).title,
    ).toBe('Added 2 people')
    expect(
      doneCopy(
        [
          { key: 'a', result: 'added' },
          { key: 'x@new.test', result: 'invited' },
        ],
        workspaceCtx,
      ),
    ).toEqual({
      title: 'Added, and one invite sent',
      body: 'People already in Acme Inc can open Sales now. Anyone invited gets access the moment they accept.',
    })
    expect(doneCopy([{ key: 'x@new.test', result: 'invited' }], workspaceCtx).title).toBe(
      'Invite sent',
    )
  })

  it('names the workspaces the server granted, not the ones asked for', () => {
    const ctx = { ...workspaceCtx, kind: 'project' as const, where: 'Sales and IT' }
    const eve = { key: 'eve', result: 'added' as const, workspaces: ['IT'] }
    expect(doneLine(eve, ctx)).toBe('Editor in IT')
    expect(doneCopy([eve], ctx).body).toBe(
      'They can open IT now. Change any of it from Edit access.',
    )
    const sam = { key: 'sam', result: 'added' as const, workspaces: ['Sales', 'IT'] }
    expect(doneCopy([eve, sam], ctx).body).toMatch(/^They can open what each row below says now/)
  })

  it('never says people can open it now when only invites went out', () => {
    const outcomes = [
      { key: 'a', result: 'failed' as const, error: 'Already in Sales' },
      { key: 'x@new.test', result: 'invited' as const },
    ]
    expect(doneCopy(outcomes, workspaceCtx)).toEqual({
      title: 'Invite sent',
      body: 'Anyone invited gets Sales the moment they accept.',
    })
  })

  it('gives each row what they got, or the refusal', () => {
    expect(doneLine({ key: 'a', result: 'added' }, workspaceCtx)).toBe('Editor in Sales')
    expect(doneLine({ key: 'x', result: 'invited' }, workspaceCtx)).toBe(
      'Invite sent · expires in 7 days',
    )
    expect(
      doneLine({ key: 'a', result: 'failed', error: 'Already in this workspace' }, workspaceCtx),
    ).toBe('Already in this workspace')
  })
})
