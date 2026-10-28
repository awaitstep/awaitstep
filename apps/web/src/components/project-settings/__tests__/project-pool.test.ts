import { describe, expect, it } from 'vitest'
import type { ProjectMembers } from '../../../types/dashboard/access'
import { inheritedVariables, projectAdmins, wholeProjectIds } from '../project-pool'

const person = (id: string) => ({
  id,
  name: id,
  email: `${id}@acme.test`,
  initials: 'XX',
  image: null,
})

const MEMBERS: ProjectMembers = {
  wholeProject: [
    { person: person('ama'), role: 'owner' },
    { person: person('ola'), role: 'org-admin' },
    { person: person('tom'), role: 'project-admin' },
    { person: person('sam'), role: 'project-member' },
  ],
  workspacesOnly: [{ person: person('dan'), workspaces: [] }],
}

describe('project pool', () => {
  it('counts owners, org admins and project admins as admins, not project members', () => {
    expect(projectAdmins(MEMBERS).map((p) => p.id)).toEqual(['ama', 'ola', 'tom'])
  })

  it('treats everyone with a whole-project role as already in every workspace', () => {
    expect([...wholeProjectIds(MEMBERS)]).toEqual(['ama', 'ola', 'tom', 'sam'])
  })

  it('adds the project’s variables to the org’s it inherits', () => {
    expect(
      inheritedVariables({
        cloudflareConnected: true,
        orgVariables: 3,
        projectVariables: 2,
        projectKeys: 0,
      }),
    ).toBe(5)
  })
})
