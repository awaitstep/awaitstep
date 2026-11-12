import { describe, expect, it } from 'vitest'
import {
  KEY_ACTIONS,
  KEY_CATALOG,
  KEY_LEVELS,
  KEY_PRESETS,
  countGrants,
  grantsOutsideLevel,
  keyLevelOf,
  keyMay,
  keyScopesOf,
  matchPreset,
  normalisePermissions,
  parseKeyPermissions,
  presetPermissions,
  resourceAtLevel,
  toggleGrant,
} from '../key-permissions.js'

describe('the key catalog', () => {
  it.each(KEY_LEVELS)('lists each %s resource once, with actions in grid order', (level) => {
    const ids = KEY_CATALOG[level].map((resource) => resource.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const resource of KEY_CATALOG[level]) {
      const order = resource.actions.map((action) => KEY_ACTIONS.indexOf(action))
      expect(order.every((index) => index >= 0)).toBe(true)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    }
  })

  it('never offers workflow actions to organization keys, nor workspace management to workspace keys', () => {
    expect(KEY_CATALOG.organization.map((r) => r.id)).not.toContain('workflows')
    expect(KEY_CATALOG.organization.flatMap((r) => r.actions)).not.toContain('deploy')
    expect(KEY_PRESETS.organization).not.toContain('deploy-run')
    expect(KEY_CATALOG.workspace.map((r) => r.id)).not.toContain('workspaces')
    expect(resourceAtLevel('workspace', 'workspaces')).toBe(false)
    expect(resourceAtLevel('project', 'workspaces')).toBe(true)
  })

  it('offers people as read-only, and a workspace’s own variables in full (B4)', () => {
    expect(KEY_CATALOG.organization.find((r) => r.id === 'members')!.actions).toEqual(['read'])
    expect(KEY_CATALOG.project.find((r) => r.id === 'members')!.actions).toEqual(['read'])
    expect(KEY_CATALOG.workspace.find((r) => r.id === 'variables')!.actions).toEqual([
      'read',
      'write',
      'delete',
    ])
  })

  it('offers the audit log read-only, and only to organization keys (B7)', () => {
    expect(KEY_CATALOG.organization.find((r) => r.id === 'audit')!.actions).toEqual(['read'])
    expect(resourceAtLevel('project', 'audit')).toBe(false)
    expect(resourceAtLevel('workspace', 'audit')).toBe(false)
    expect(keyMay('organization', { audit: ['read'] }, 'audit', 'read')).toBe(true)
    expect(keyMay('organization', { audit: ['read', 'write'] }, 'audit', 'write')).toBe(false)
    expect(parseKeyPermissions('{"audit":["read"]}')).toEqual({ audit: ['read'] })
  })

  it('offers the Library to project and workspace keys, and reads every catalog resource back', () => {
    expect(resourceAtLevel('project', 'library')).toBe(true)
    expect(resourceAtLevel('workspace', 'library')).toBe(true)
    expect(resourceAtLevel('organization', 'library')).toBe(false)
    expect(parseKeyPermissions('{"library":["read","write"]}')).toEqual({
      library: ['read', 'write'],
    })
    for (const entries of Object.values(KEY_CATALOG)) {
      for (const entry of entries) {
        expect(parseKeyPermissions({ [entry.id]: ['read'] }), entry.id).not.toBeNull()
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
      library: ['read'],
    })
  })

  it('Full access on a workspace key sets its variables', () => {
    expect(presetPermissions('workspace', 'full')).toEqual({
      workflows: ['read', 'write', 'delete', 'deploy', 'run'],
      runs: ['read'],
      variables: ['read', 'write', 'delete'],
      library: ['read', 'write', 'delete'],
    })
  })

  it('Deploy & run adds deploy and run on workflows to Read only', () => {
    expect(presetPermissions('project', 'deploy-run')).toEqual({
      workspaces: ['read'],
      workflows: ['read', 'deploy', 'run'],
      runs: ['read'],
      variables: ['read'],
      library: ['read'],
      members: ['read'],
    })
  })

  it('Full access grants every valid cell', () => {
    expect(presetPermissions('organization', 'full')).toEqual({
      projects: ['read', 'write', 'delete'],
      members: ['read'],
      connections: ['read', 'write', 'delete'],
      resources: ['read', 'write', 'delete'],
      audit: ['read'],
    })
  })

  it.each(KEY_LEVELS)('matches each %s preset to its own permissions', (level) => {
    for (const preset of KEY_PRESETS[level]) {
      expect(matchPreset(level, presetPermissions(level, preset))).toBe(preset)
    }
  })

  it('matches regardless of action order, and is custom when the ticks match no preset', () => {
    expect(
      matchPreset('workspace', {
        workflows: ['run', 'deploy', 'read'],
        variables: ['read'],
        library: ['read'],
        runs: ['read'],
      }),
    ).toBe('deploy-run')
    expect(matchPreset('workspace', { workflows: ['read'] })).toBe('custom')
    expect(matchPreset('workspace', {})).toBe('custom')
  })
})

describe('editing a grid', () => {
  it('adds a cell in catalog order and removes it again', () => {
    const added = toggleGrant('workspace', { workflows: ['read', 'run'] }, 'workflows', 'deploy')
    expect(added).toEqual({ workflows: ['read', 'deploy', 'run'] })
    expect(toggleGrant('workspace', added, 'workflows', 'deploy')).toEqual({
      workflows: ['read', 'run'],
    })
  })

  it('drops a resource once its last cell is cleared, and ignores cells the level does not offer', () => {
    expect(toggleGrant('workspace', { runs: ['read'] }, 'runs', 'read')).toEqual({})
    expect(toggleGrant('workspace', {}, 'runs', 'write')).toEqual({})
  })

  it('counts only valid cells and normalises away the rest', () => {
    expect(countGrants('workspace', { workflows: ['read', 'deploy'], runs: ['write'] })).toBe(2)
    expect(
      normalisePermissions('organization', { projects: ['delete', 'read'], workflows: ['run'] }),
    ).toEqual({
      projects: ['read', 'delete'],
    })
  })

  it('names the cells a level does not offer', () => {
    expect(
      grantsOutsideLevel('organization', { workflows: ['deploy'], projects: ['read'] }),
    ).toEqual(['workflows: deploy'])
    expect(grantsOutsideLevel('workspace', { workspaces: ['write'] })).toEqual([
      'workspaces: write',
    ])
    expect(grantsOutsideLevel('workspace', { variables: ['write'] })).toEqual([])
    expect(grantsOutsideLevel('project', presetPermissions('project', 'full'))).toEqual([])
  })
})

describe('checking a key', () => {
  it('allows a granted cell the level offers and nothing else', () => {
    const grid = { workflows: ['read', 'deploy'] as const }
    expect(keyMay('project', { workflows: [...grid.workflows] }, 'workflows', 'deploy')).toBe(true)
    expect(keyMay('project', { workflows: [...grid.workflows] }, 'workflows', 'write')).toBe(false)
    expect(keyMay('project', { workflows: [...grid.workflows] }, 'runs', 'read')).toBe(false)
    // Granted but not offered at the level: never.
    expect(keyMay('organization', { workflows: ['read'] }, 'workflows', 'read')).toBe(false)
    expect(keyMay('workspace', { workspaces: ['write'] }, 'workspaces', 'write')).toBe(false)
    expect(keyMay('workspace', { variables: ['write'] }, 'variables', 'write')).toBe(true)
  })

  it('reads the level off the row', () => {
    expect(keyLevelOf({ level: 'organization' })).toBe('organization')
    expect(keyLevelOf({ level: 'project' })).toBe('project')
    expect(keyLevelOf({ level: 'workspace' })).toBe('workspace')
  })

  it('parses a stored grid and refuses anything else', () => {
    expect(parseKeyPermissions('{"workflows":["read","run"]}')).toEqual({
      workflows: ['read', 'run'],
    })
    expect(parseKeyPermissions({ runs: ['read'] })).toEqual({ runs: ['read'] })
    expect(parseKeyPermissions('{}')).toEqual({})
    expect(parseKeyPermissions('not json')).toBeNull()
    expect(parseKeyPermissions('[]')).toBeNull()
    expect(parseKeyPermissions({ billing: ['read'] })).toBeNull()
    expect(parseKeyPermissions({ workflows: ['fly'] })).toBeNull()
    expect(parseKeyPermissions({ workflows: 'read' })).toBeNull()
  })

  it('amounts to the coarse scopes older keys carried', () => {
    expect(keyScopesOf('workspace', { workflows: ['read'] })).toEqual(['read'])
    expect(keyScopesOf('project', { workspaces: ['delete'] })).toEqual(['read', 'write'])
    expect(keyScopesOf('project', { workflows: ['run'] })).toEqual(['read', 'deploy'])
    expect(keyScopesOf('project', presetPermissions('project', 'full'))).toEqual([
      'read',
      'write',
      'deploy',
    ])
    // Cells the level does not offer count for nothing.
    expect(keyScopesOf('organization', { workflows: ['deploy'] })).toEqual(['read'])
  })
})
