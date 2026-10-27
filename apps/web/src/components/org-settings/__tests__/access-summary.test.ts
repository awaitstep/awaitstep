import { describe, expect, it } from 'vitest'
import { invitationLabel, placeLabel } from '../access-summary'

const p101 = { id: 'p', name: 'Project 101', workspaceCount: 3 }
const internal = { id: 'i', name: 'Internal Tools', workspaceCount: 1 }

describe('placeLabel', () => {
  it('reads as the Members board draws it', () => {
    expect(placeLabel({ project: p101, workspace: null, role: 'admin' })).toBe(
      'Project 101 · all workspaces',
    )
    expect(placeLabel({ project: internal, workspace: null, role: 'member' })).toBe(
      'Internal Tools',
    )
    expect(
      placeLabel({ project: p101, workspace: { id: 's', name: 'Sales' }, role: 'editor' }),
    ).toBe('Project 101 · Sales (Editor)')
  })
})

describe('invitationLabel', () => {
  it('names the role and where they’ll work', () => {
    expect(
      invitationLabel({
        id: 'i',
        email: 'sam@acme.test',
        role: 'member',
        places: [{ kind: 'workspace', project: 'Project 101', workspace: 'IT', role: 'editor' }],
        sentAt: '',
        invitedBy: { id: 'a', name: 'Ama' },
      }),
    ).toBe('Member · Project 101 · IT')
  })
})
