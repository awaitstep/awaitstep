import { describe, expect, it } from 'vitest'
import { filterOptions, isCovered, scopeOptions, togglePick } from '../scope-picks'
import { CLOUDFLARE_PROJECTS, INVITE_PROJECTS } from './fixtures/scope-picks'

const options = scopeOptions(INVITE_PROJECTS)

function option(id: string) {
  const found = options.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no option ${id}`)
  return found
}

describe('scope options', () => {
  it('lists each project before its workspaces', () => {
    expect(options.slice(0, 5).map((o) => o.id)).toEqual([
      'p:p101',
      'ws:p101:sales',
      'ws:p101:it',
      'ws:p101:support',
      'p:marketing',
    ])
    expect(option('p:p101')).toMatchObject({
      label: 'Project 101 · every workspace',
      meta: 'Project',
    })
    expect(option('ws:p101:it')).toMatchObject({
      label: 'IT',
      chip: 'Project 101 › IT',
      meta: 'Workspace',
    })
  })

  it('offers whole projects only when no workspaces are given', () => {
    const projectsOnly = scopeOptions(CLOUDFLARE_PROJECTS)
    expect(projectsOnly.every((o) => o.kind === 'project')).toBe(true)
    expect(projectsOnly[0]).toMatchObject({ label: 'Project 101', meta: '3 workspaces' })
  })
})

describe('togglePick', () => {
  it('adds and removes a pick', () => {
    const added = togglePick([], option('ws:p101:it'))
    expect(added).toEqual(['ws:p101:it'])
    expect(togglePick(added, option('ws:p101:it'))).toEqual([])
  })

  it('drops a project’s workspace picks when the project is picked', () => {
    const picks = ['ws:p101:it', 'ws:p101:sales', 'p:marketing']
    expect(togglePick(picks, option('p:p101'))).toEqual(['p:marketing', 'p:p101'])
  })

  it('leaves a covered workspace alone', () => {
    const picks = ['p:p101']
    expect(isCovered(option('ws:p101:sales'), picks)).toBe(true)
    expect(isCovered(option('ws:marketing:default'), picks)).toBe(false)
    expect(togglePick(picks, option('ws:p101:sales'))).toEqual(['p:p101'])
  })
})

describe('filterOptions', () => {
  it('matches workspaces by their project too', () => {
    expect(filterOptions(options, 'sal').map((o) => o.id)).toEqual(['ws:p101:sales'])
    expect(filterOptions(options, 'data').map((o) => o.id)).toEqual([
      'p:data',
      'ws:data:ingest',
      'ws:data:reports',
    ])
  })

  it('returns everything for an empty query and nothing for no match', () => {
    expect(filterOptions(options, '  ')).toHaveLength(options.length)
    expect(filterOptions(options, 'zzz')).toEqual([])
  })
})
