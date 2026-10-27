import { describe, expect, it } from 'vitest'
import { filterProjects } from '../project-search'
import { MARKETING_SITE, PROJECT_101 } from '../parts/__tests__/fixtures/projects'

const PROJECTS = [PROJECT_101, MARKETING_SITE]

describe('filterProjects', () => {
  it('matches a project by its name or one of its workspaces, ignoring case', () => {
    expect(filterProjects(PROJECTS, 'MARK').map((p) => p.name)).toEqual(['Marketing Site'])
    expect(filterProjects(PROJECTS, 'sales').map((p) => p.name)).toEqual(['Project 101'])
  })

  it('keeps everything for a blank query and nothing for no match', () => {
    expect(filterProjects(PROJECTS, '  ')).toHaveLength(2)
    expect(filterProjects(PROJECTS, 'zzz')).toEqual([])
  })
})
