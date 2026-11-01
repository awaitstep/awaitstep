import { describe, it, expect, beforeEach } from 'vitest'
import { createSqliteApp, seedAcme, type SqliteApp } from './sqlite-app.js'
import { unresolvableEnvRefs } from '../lib/env-resolve.js'

// One variable that reaches several workspaces (a project's) or projects
// (an organization's), through the real adapter: created with a list, only
// ever widened, never overwriting a place's own value.

const ORG = 'org=acme'
const P101 = 'org=acme&project=project-101'
const SALES = 'org=acme&project=project-101&workspace=sales'

describe('variables that reach several places', () => {
  let h: SqliteApp

  const send = (method: string, path: string, body: unknown) =>
    h.app.request(`/api/env-vars${path}`, h.as('u-ama', { ...h.json(body), method }))
  const create = (at: string, body: Record<string, unknown>) =>
    send('POST', `?${at}`, { name: 'API_URL', value: 'u', isSecret: false, ...body })
  const resolved = async (at: string) => {
    const res = await h.app.request(`/api/env-vars/resolved?${at}`, h.as('u-ama'))
    return ((await res.json()) as { data: { name: string; reach: unknown }[] }).data
  }

  beforeEach(async () => {
    h = createSqliteApp()
    await seedAcme(h)
  })

  it('creates one project variable for the listed workspaces, and only they read it', async () => {
    const res = await create(P101, { reach: { ids: ['ws-sales'] } })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ skipped: [] })
    const read = (ws: string) => h.adapter.findEnvVarsByNames('org-acme', ['API_URL'], 'p-101', ws)
    expect(await read('ws-sales')).toHaveLength(1)
    expect(await read('ws-ops')).toHaveLength(0)
    expect((await resolved(P101)).find((v) => v.name === 'API_URL')!.reach).toMatchObject({
      all: false,
      places: [{ id: 'ws-sales' }],
    })
  })

  it('skips a workspace with its own value and says so; with none left it answers 409 and saves nothing', async () => {
    await create(SALES, {})
    const partial = await create(P101, { reach: { ids: ['ws-sales', 'ws-ops'] } })
    expect(partial.status).toBe(201)
    expect(await partial.json()).toMatchObject({ skipped: ['ws-sales'] })
    await send(
      'DELETE',
      `/${(await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data[0]!.id}?${P101}`,
      {},
    )
    const none = await create(P101, { reach: { ids: ['ws-sales'] } })
    expect(none.status).toBe(409)
    expect(await none.json()).toMatchObject({ skipped: ['ws-sales'] })
    expect((await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data).toHaveLength(0)
  })

  it('an organization variable lists projects', async () => {
    const res = await create(ORG, { reach: { ids: ['p-101'] } })
    expect(res.status).toBe(201)
    const read = (project: string, ws: string) =>
      h.adapter.findEnvVarsByNames('org-acme', ['API_URL'], project, ws)
    expect(await read('p-101', 'ws-ops')).toHaveLength(1)
    expect(await read('p-202', 'ws-202')).toHaveLength(0)
  })

  it('edits widen only: add places, then everywhere, never fewer', async () => {
    const created = (await (await create(P101, { reach: { ids: ['ws-sales'] } })).json()) as {
      id: string
    }
    const add = await send('PATCH', `/${created.id}?${P101}`, {
      value: 'v2',
      reach: { ids: ['ws-ops'] },
    })
    expect(add.status).toBe(200)
    expect(
      (await h.adapter.findEnvVarsByNames('org-acme', ['API_URL'], 'p-101', 'ws-ops'))[0]!.value,
    ).toBe('v2')
    const all = await send('PATCH', `/${created.id}?${P101}`, { reach: { all: true } })
    expect(all.status).toBe(200)
    const narrow = await send('PATCH', `/${created.id}?${P101}`, { reach: { ids: ['ws-sales'] } })
    expect(narrow.status).toBe(422)
  })

  it('refuses a list at a workspace, an empty list, and more than 50 places', async () => {
    expect((await create(SALES, { reach: { ids: ['ws-sales'] } })).status).toBe(400)
    expect((await create(P101, { reach: { ids: [] } })).status).toBe(422)
    const many = Array.from({ length: 51 }, (_, i) => `ws-${i}`)
    expect((await create(P101, { reach: { ids: many } })).status).toBe(422)
  })

  it('a workspace admin cannot widen the project’s variable, though they set their own workspace’s', async () => {
    await h.seed.workspaceGrant('ws-ops', 'u-fay', 'admin')
    const created = (await (await create(P101, { reach: { ids: ['ws-sales'] } })).json()) as {
      id: string
    }
    const asEve = (path: string, method: string, body: unknown) =>
      h.app.request(`/api/env-vars${path}`, h.as('u-fay', { ...h.json(body), method }))
    expect((await asEve(`/${created.id}?${P101}`, 'PATCH', { reach: { all: true } })).status).toBe(
      403,
    )
    expect(
      (await asEve(`?${P101}`, 'POST', { name: 'X', value: '1', reach: { ids: ['ws-sales'] } }))
        .status,
    ).toBe(403)
    expect((await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data[0]!.allPlaces).toBe(
      false,
    )
    expect(
      (
        await asEve(`?org=acme&project=project-101&workspace=ops`, 'POST', {
          name: 'MINE',
          value: '1',
          isSecret: false,
        })
      ).status,
    ).toBe(201)
  })

  it('an edit that would narrow answers 422 and changes nothing, not even the value', async () => {
    const created = (await (await create(P101, {})).json()) as { id: string }
    const res = await send('PATCH', `/${created.id}?${P101}`, {
      value: 'new',
      reach: { ids: ['ws-sales'] },
    })
    expect(res.status).toBe(422)
    const rows = await h.adapter.listEnvVarsByProject('org-acme', 'p-101')
    expect(rows.data[0]!.value).toBe('u')
  })

  it('names a place that is not the level’s as 404, never as a skipped one, and saves nothing', async () => {
    // Another project's workspace, and a made-up id.
    expect((await create(P101, { reach: { ids: ['ws-202'] } })).status).toBe(404)
    expect((await create(P101, { reach: { ids: ['ws-sales', 'nope'] } })).status).toBe(404)
    expect((await h.adapter.listEnvVarsByProject('org-acme', 'p-101')).data).toHaveLength(0)
    const created = (await (await create(P101, { reach: { ids: ['ws-sales'] } })).json()) as {
      id: string
    }
    const res = await send('PATCH', `/${created.id}?${P101}`, { reach: { ids: ['ws-202'] } })
    expect(res.status).toBe(404)
  })

  it('a workflow moved into a project is warned about a variable limited to some workspaces', async () => {
    await create(P101, { name: 'REGION', reach: { ids: ['ws-ops'] } })
    const wf = (await h.adapter.getWorkflowById('wf-sales'))!
    await h.adapter.setWorkflowEnvVars('wf-sales', [
      { name: 'REGION', value: '{{global.env.REGION}}', isSecret: false },
    ])
    const moved = (await h.adapter.getWorkflowById(wf.id))!
    // The move lands in the project's oldest workspace, which may not be Ops.
    expect(await unresolvableEnvRefs(h.adapter, 'org-acme', 'p-101', moved)).toEqual(['REGION'])
  })
})
