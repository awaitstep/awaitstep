import { beforeEach, describe, expect, it } from 'vitest'
import { resetMockDb } from '../db'
import { AMA, DANIEL } from '../fixtures/people'
import type { MockContext } from '../scenario'
import { mockServer } from '../server'

const { resources, audit, variables } = mockServer
const as = (userId: string, scenario: MockContext['scenario'] = 'none'): MockContext => ({
  userId,
  scenario,
})
const ama = as(AMA)
const daniel = as(DANIEL)

beforeEach(() => resetMockDb(new Date()))

describe('org nodes', () => {
  it('lists the board’s fourteen: two custom and four marketplace installed, eight available', async () => {
    const nodes = await resources.listOrgNodes(ama, 'acme')
    expect(nodes).toHaveLength(14)
    expect(nodes.filter((n) => n.installed).map((n) => n.name)).toEqual([
      'Acme CRM lookup',
      'Acme audit event',
      'Slack',
      'Google Gemini',
      'Stripe',
      'Resend',
    ])
    expect(nodes.find((n) => n.id === 'acme-crm')).toMatchObject({
      source: 'custom',
      author: 'Tom Becker',
      version: '4',
      usage: 5,
    })
    expect(nodes.find((n) => n.id === 'slack')).toMatchObject({
      version: '2.3.0',
      latestVersion: '2.4.0',
      updateAvailable: true,
      usage: 6,
    })
    expect(nodes.find((n) => n.id === 'anthropic')).toMatchObject({
      installed: false,
      usage: undefined,
      updateAvailable: false,
    })
  })

  it('gives other orgs the marketplace with nothing installed', async () => {
    const nodes = await resources.listOrgNodes(as(AMA), 'bolt-labs')
    expect(nodes).toHaveLength(12)
    expect(nodes.some((n) => n.installed)).toBe(false)
  })

  it('installs at the latest version, unused, and uninstalls again', async () => {
    await resources.installNode(ama, 'acme', 'anthropic')
    let node = (await resources.listOrgNodes(ama, 'acme')).find((n) => n.id === 'anthropic')
    expect(node).toMatchObject({ installed: true, version: '1.2.0', usage: 0 })
    await resources.uninstallNode(ama, 'acme', 'anthropic')
    node = (await resources.listOrgNodes(ama, 'acme')).find((n) => n.id === 'anthropic')
    expect(node).toMatchObject({ installed: false })
  })

  it('updates Slack to the latest version', async () => {
    await resources.updateNode(ama, 'acme', 'slack')
    const slack = (await resources.listOrgNodes(ama, 'acme')).find((n) => n.id === 'slack')
    expect(slack).toMatchObject({ version: '2.4.0', updateAvailable: false, usage: 6 })
  })

  it('keeps custom nodes installed and refuses updating what isn’t installed', async () => {
    await expect(resources.uninstallNode(ama, 'acme', 'acme-crm')).rejects.toMatchObject({
      status: 422,
    })
    await expect(resources.updateNode(ama, 'acme', 'openai')).rejects.toMatchObject({
      status: 422,
    })
  })

  it('lets members look but not change anything', async () => {
    expect(await resources.listOrgNodes(daniel, 'acme')).toHaveLength(14)
    await expect(resources.installNode(daniel, 'acme', 'openai')).rejects.toMatchObject({
      status: 403,
    })
    await expect(resources.uninstallNode(daniel, 'acme', 'slack')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('answers Not found for a node outside the catalog', async () => {
    await expect(resources.installNode(ama, 'acme', 'nope')).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('org variables', () => {
  it('lists what Acme sets, with secrets hidden and REGION overridden in one project', async () => {
    const list = await variables.listOrgVariables(ama, 'acme')
    expect(list).toEqual([
      { name: 'REGION', value: 'eu', isSecret: false, overriddenIn: 1 },
      { name: 'SUPPORT_EMAIL', value: 'support@acme.test', isSecret: false, overriddenIn: 0 },
      { name: 'SENTRY_DSN', value: null, isSecret: true, overriddenIn: 0 },
    ])
  })

  it('counts a workspace override as its project overriding', async () => {
    await variables.setVariable(ama, 'acme', {
      scope: { level: 'workspace', project: 'project-101', workspace: 'sales' },
      name: 'SUPPORT_EMAIL',
      value: 'sales@acme.test',
      isSecret: false,
      mode: 'create',
    })
    const list = await variables.listOrgVariables(ama, 'acme')
    expect(list.find((v) => v.name === 'SUPPORT_EMAIL')!.overriddenIn).toBe(1)
  })

  it('only counts projects the viewer can open', async () => {
    // Daniel isn't in Marketing site, where REGION is overridden.
    const list = await variables.listOrgVariables(daniel, 'acme')
    expect(list.find((v) => v.name === 'REGION')!.overriddenIn).toBe(0)
  })
})

describe('audit log', () => {
  it('starts with the board’s seven events in the last 7 days, newest first', async () => {
    const page = await audit.listAuditEvents(ama, 'acme')
    expect(page.total).toBe(7)
    expect(page.nextCursor).toBeNull()
    expect(page.data.map((e) => [e.actor, e.action, e.target])).toEqual([
      ['Tom Becker', 'tried to delete the workspace', 'IT'],
      ['CI deploys', 'deployed', 'Lead enrichment v12'],
      ['Ama Mensah', 'created the API key', 'CRM webhook'],
      ['Ama Mensah', 'added Daniel Kim to', 'Sales'],
      ['Ama Mensah', 'invited', 'sam@acme.test'],
      ['Unknown', 'failed to sign in as', 'tom@acme.test'],
      ['Ama Mensah', 'turned on the deletion lock for', 'Project 101'],
    ])
    expect(page.data[0]!.scope).toEqual({ level: 'project', name: 'Project 101' })
    expect(page.data[1]!.scope).toEqual({
      level: 'workspace',
      name: 'Project 101 · Sales',
      colour: 'green',
    })
    expect(page.data[4]!.scope).toEqual({ level: 'organization', name: 'Acme Inc' })
  })

  it('narrows by level, period and search', async () => {
    const workspace = await audit.listAuditEvents(ama, 'acme', { level: 'workspace' })
    expect(workspace.total).toBe(3)
    const day = await audit.listAuditEvents(ama, 'acme', { period: '24h' })
    expect(day.total).toBe(4)
    const lock = await audit.listAuditEvents(ama, 'acme', { search: 'Deletion lock' })
    expect(lock.data.map((e) => e.target)).toEqual(['Project 101'])
    const person = await audit.listAuditEvents(ama, 'acme', { search: 'tom', period: '90d' })
    expect(person.data.every((e) => /tom/i.test(`${e.actor} ${e.action} ${e.target}`))).toBe(true)
  })

  it('pages the longer periods with an opaque cursor', async () => {
    const first = await audit.listAuditEvents(ama, 'acme', { period: '90d' })
    expect(first.total).toBe(47)
    expect(first.data).toHaveLength(25)
    const second = await audit.listAuditEvents(ama, 'acme', {
      period: '90d',
      cursor: first.nextCursor!,
    })
    expect(second.data).toHaveLength(22)
    expect(second.nextCursor).toBeNull()
    expect(second.data[0]!.at <= first.data.at(-1)!.at).toBe(true)
  })

  it('is for org owners and admins only', async () => {
    await expect(audit.listAuditEvents(daniel, 'acme')).rejects.toMatchObject({ status: 403 })
  })

  it('shows nothing under the empty scenario', async () => {
    const page = await audit.listAuditEvents(as(AMA, 'empty'), 'acme')
    expect(page).toEqual({ data: [], nextCursor: null, total: 0 })
  })
})
