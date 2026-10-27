import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetMockDb } from '../db'
import { AMA, DANIEL } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { keys, variables, setup } = mockServer
const as = (userId: string): MockContext => ({ userId, scenario: 'none' })
const ama = as(AMA)
const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }

beforeEach(() => resetMockDb(new Date()))

describe('create key', () => {
  it('creates a project key, keeping only its prefix, and shows it first', async () => {
    const { key, secret } = await keys.createKey(ama, 'acme', {
      level: 'project',
      project: 'project-101',
      name: 'Release bot',
      expires: '30',
      permissions: { workflows: ['read', 'deploy'] },
    })
    expect(secret).toMatch(/^ask_p1_[a-z0-9]{32}$/)
    expect(key.prefix).toBe(`ask_p1…${secret.slice(-4)}`)
    expect(JSON.stringify(getDb().keys)).not.toContain(secret)
    expect((await keys.listProjectKeys(ama, 'acme', 'project-101')).keys[0]!.name).toBe(
      'Release bot',
    )
    expect((await setup.getProjectSetup(ama, 'acme', 'project-101')).projectKeys).toBe(4)
  })

  it('creates org and workspace keys on their own pages', async () => {
    await keys.createKey(ama, 'acme', {
      level: 'organization',
      name: 'Audit export',
      expires: 'never',
      permissions: { audit: ['read'] },
    })
    expect((await keys.listOrgKeys(ama, 'acme'))[0]!).toMatchObject({
      name: 'Audit export',
      expiresAt: null,
    })
    await keys.createKey(ama, 'acme', {
      level: 'workspace',
      project: 'project-101',
      workspace: 'sales',
      name: 'Sales hook',
      expires: '90',
      permissions: { workflows: ['run'] },
    })
    expect((await keys.listWorkspaceKeys(ama, sales)).own.map((k) => k.name)).toContain(
      'Sales hook',
    )
  })

  it('refuses no name, no permissions, and levels the viewer can’t manage', async () => {
    const base = { level: 'project' as const, project: 'project-101', expires: '30' as const }
    await expect(
      keys.createKey(ama, 'acme', { ...base, name: ' ', permissions: { runs: ['read'] } }),
    ).rejects.toMatchObject({ field: 'name' })
    await expect(
      keys.createKey(ama, 'acme', { ...base, name: 'x', permissions: {} }),
    ).rejects.toMatchObject({ field: 'permissions' })
    await expect(
      keys.createKey(as(DANIEL), 'acme', { ...base, name: 'x', permissions: { runs: ['read'] } }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('set variable', () => {
  const project = { level: 'project' as const, project: 'project-101' }

  it('adds a project variable, and refuses bad or taken names', async () => {
    await variables.setVariable(ama, 'acme', {
      scope: project,
      name: 'STRIPE_KEY',
      value: 'sk_live_x',
      isSecret: true,
      mode: 'create',
    })
    const stripe = (await variables.listProjectVariables(ama, 'acme', 'project-101')).find(
      (v) => v.name === 'STRIPE_KEY',
    )
    expect(stripe).toMatchObject({ isSecret: true, value: null })
    const add = (name: string) =>
      variables.setVariable(ama, 'acme', {
        scope: project,
        name,
        value: 'v',
        isSecret: false,
        mode: 'create',
      })
    await expect(add('9BAD')).rejects.toMatchObject({ field: 'name' })
    await expect(add('SLACK_TOKEN')).rejects.toMatchObject({
      field: 'name',
      message: 'Already set in Project 101. Edit it instead',
    })
  })

  it('keeps a secret when edited with an empty value', async () => {
    await variables.setVariable(ama, 'acme', {
      scope: project,
      name: 'SLACK_TOKEN',
      value: '',
      isSecret: true,
      mode: 'edit',
    })
    expect(getDb().variables.find((v) => v.name === 'SLACK_TOKEN')!.value).toBe('xoxb-dummy')
  })

  it('overrides an org value in the project, and deletes it again', async () => {
    await variables.setVariable(ama, 'acme', {
      scope: project,
      name: 'REGION',
      value: 'us',
      isSecret: false,
      mode: 'create',
    })
    const region = () =>
      variables
        .listProjectVariables(ama, 'acme', 'project-101')
        .then((l) => l.find((v) => v.name === 'REGION'))
    expect(await region()).toMatchObject({ value: 'us', setAt: { level: 'project' } })
    await variables.deleteVariable(ama, 'acme', project, 'REGION')
    expect(await region()).toMatchObject({ value: 'eu', setAt: { level: 'organization' } })
  })

  it('is for those who manage the level', async () => {
    await expect(
      variables.setVariable(as(DANIEL), 'acme', {
        scope: { level: 'organization' },
        name: 'X',
        value: 'v',
        isSecret: false,
        mode: 'create',
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe('review round (2026-10-27)', () => {
  const project = { level: 'project' as const, project: 'project-101' }

  it('won’t un-hide a secret without its value being typed', async () => {
    await expect(
      variables.setVariable(ama, 'acme', {
        scope: project,
        name: 'SLACK_TOKEN',
        value: '',
        isSecret: false,
        mode: 'edit',
      }),
    ).rejects.toMatchObject({ field: 'value', message: 'Enter the value to stop hiding it' })
    expect(getDb().variables.find((v) => v.name === 'SLACK_TOKEN')!.isSecret).toBe(true)
  })

  it('won’t blank a value on edit, as on create', async () => {
    await expect(
      variables.setVariable(ama, 'acme', {
        scope: project,
        name: 'CRM_BASE_URL',
        value: '',
        isSecret: false,
        mode: 'edit',
      }),
    ).rejects.toMatchObject({ field: 'value' })
  })

  it('says which level is missing instead of crashing', async () => {
    await expect(
      variables.setVariable(ama, 'acme', {
        scope: { level: 'project' },
        name: 'X',
        value: 'v',
        isSecret: false,
        mode: 'create',
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Pick a project' })
    await expect(
      keys.createKey(ama, 'acme', {
        level: 'workspace',
        project: 'project-101',
        name: 'x',
        expires: '30',
        permissions: { runs: ['read'] },
      }),
    ).rejects.toMatchObject({ status: 422, message: 'Pick a workspace' })
  })

  it('refuses an expiry it doesn’t offer, and grants a level doesn’t have', async () => {
    const base = { level: 'organization' as const, name: 'x' }
    await expect(
      keys.createKey(ama, 'acme', {
        ...base,
        expires: '60' as '30',
        permissions: { audit: ['read'] },
      }),
    ).rejects.toMatchObject({ field: 'expires' })
    await expect(
      keys.createKey(ama, 'acme', {
        ...base,
        expires: '30',
        permissions: { workflows: ['deploy'] },
      }),
    ).rejects.toMatchObject({ field: 'permissions', message: /workflows: deploy/ })
  })
})
