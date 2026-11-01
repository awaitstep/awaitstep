import { describe, expect, it } from 'vitest'
import { overviewLead } from '../overview-lead'

const base = {
  description: null,
  people: 2,
  workflows: 0,
  functions: 0,
  projectName: 'Project 101',
  firstInProject: true,
}

describe('overviewLead', () => {
  it('names the workspace a project started with while it is empty', () => {
    expect(overviewLead({ ...base, state: 'empty' })).toBe(
      'The workspace Project 101 started with · 2 people can open it',
    )
    expect(overviewLead({ ...base, state: 'empty', firstInProject: false })).toBe(
      '2 people can open it',
    )
    expect(overviewLead({ ...base, state: 'empty', description: 'Support desk' })).toBe(
      'Support desk · 2 people can open it',
    )
  })

  it('counts what is built when nothing has run', () => {
    expect(overviewLead({ ...base, state: 'quiet', workflows: 6, functions: 2 })).toBe(
      '6 workflows and 2 functions, none of them running yet · 2 people can open it',
    )
  })

  it('keeps the description once runs come in', () => {
    expect(
      overviewLead({ ...base, state: 'active', description: 'Lead handling', people: 4 }),
    ).toBe('Lead handling · 4 people can open this workspace')
  })
})
