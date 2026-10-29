import { describe, expect, it } from 'vitest'
import type { KeyLevel } from '../../../../types/dashboard/api-keys'
import {
  KEY_ACTIONS,
  KEY_CATALOG,
  KEY_PRESETS,
  countGrants,
  describeGrantCount,
  describeGrants,
  describeReach,
  matchPreset,
  presetPermissions,
  toggleGrant,
} from '../key-permissions'

const LEVELS: KeyLevel[] = ['organization', 'project', 'workspace']

describe('key permission catalog', () => {
  it.each(LEVELS)('lists each %s resource once, with actions in grid order', (level) => {
    const ids = KEY_CATALOG[level].map((resource) => resource.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const resource of KEY_CATALOG[level]) {
      const order = resource.actions.map((action) => KEY_ACTIONS.indexOf(action))
      expect(order.every((index) => index >= 0)).toBe(true)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })

  it('never offers workflow actions to organization keys', () => {
    const resources = KEY_CATALOG.organization.map((resource) => resource.id)
    expect(resources).not.toContain('workflows')
    expect(KEY_CATALOG.organization.flatMap((resource) => resource.actions)).not.toContain('deploy')
    expect(KEY_PRESETS.organization).not.toContain('deploy-run')
  })

  it('gives every row a label and a hint', () => {
    for (const level of LEVELS) {
      for (const resource of KEY_CATALOG[level]) {
        expect(resource.label).not.toBe('')
        expect(resource.hint).not.toBe('')
      }
    }
  })
})

describe('presets', () => {
  it('Read only grants read on every resource and nothing else', () => {
    expect(presetPermissions('workspace', 'read')).toEqual({
      workflows: ['read'],
      runs: ['read'],
      variables: ['read'],
    })
  })

  it('Deploy & run adds deploy and run on workflows to Read only', () => {
    expect(presetPermissions('project', 'deploy-run')).toEqual({
      workspaces: ['read'],
      workflows: ['read', 'deploy', 'run'],
      runs: ['read'],
      variables: ['read'],
      members: ['read'],
    })
  })

  it('Full access grants every valid cell', () => {
    expect(presetPermissions('organization', 'full')).toEqual({
      projects: ['read', 'write', 'delete'],
      members: ['read'],
      connections: ['read', 'write', 'delete'],
      resources: ['read', 'write', 'delete'],
    })
  })

  it.each(LEVELS)('matches each %s preset to its own permissions', (level) => {
    for (const preset of KEY_PRESETS[level]) {
      expect(matchPreset(level, presetPermissions(level, preset))).toBe(preset)
    }
  })

  it('matches regardless of action order or empty resources', () => {
    expect(
      matchPreset('workspace', {
        workflows: ['run', 'deploy', 'read'],
        variables: ['read'],
        runs: ['read'],
      }),
    ).toBe('deploy-run')
  })

  it('is custom when the ticks match no preset, including none at all', () => {
    expect(matchPreset('workspace', { workflows: ['read'] })).toBe('custom')
    expect(matchPreset('workspace', {})).toBe('custom')
  })
})

describe('toggleGrant', () => {
  it('adds a cell in catalog order and removes it again', () => {
    const added = toggleGrant('workspace', { workflows: ['read', 'run'] }, 'workflows', 'deploy')
    expect(added).toEqual({ workflows: ['read', 'deploy', 'run'] })
    expect(toggleGrant('workspace', added, 'workflows', 'deploy')).toEqual({
      workflows: ['read', 'run'],
    })
  })

  it('drops a resource once its last cell is cleared', () => {
    expect(toggleGrant('workspace', { runs: ['read'] }, 'runs', 'read')).toEqual({})
  })

  it('ignores cells that are not valid at the level', () => {
    expect(toggleGrant('workspace', {}, 'runs', 'write')).toEqual({})
  })
})

describe('describing grants', () => {
  it('counts only valid cells', () => {
    expect(countGrants('workspace', { workflows: ['read', 'deploy'], runs: ['write'] })).toBe(2)
  })

  it('says how many permissions are selected', () => {
    expect(describeGrantCount('workspace', { workflows: ['read'] })).toBe('1 permission selected')
    expect(describeGrantCount('project', presetPermissions('project', 'deploy-run'))).toBe(
      '7 permissions selected',
    )
  })

  it('names each granted resource with its actions, in catalog order', () => {
    expect(
      describeGrants('project', { runs: ['read'], workflows: ['run', 'read', 'deploy'] }),
    ).toEqual(['Workflows & functions: read · deploy · run', 'Runs: read'])
  })

  it('says what each level reaches', () => {
    const names = { project: 'Project 101', workspace: 'Sales' }
    expect(describeReach('organization', names)).toMatch(/never read, change, deploy or run/)
    expect(describeReach('project', names)).toMatch(/^Reaches every workspace in Project 101/)
    expect(describeReach('workspace', names)).toMatch(/^Only Sales\./)
  })
})
