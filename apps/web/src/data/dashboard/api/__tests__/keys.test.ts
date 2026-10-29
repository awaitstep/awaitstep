import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyRow } from '../../../../lib/dashboard-api'
import {
  allKeyPages,
  expiresAtOf,
  toApiKey,
  toCreateKeyRequest,
  toCreatedKey,
  toProjectKeys,
  toWorkspaceKeys,
} from '../keys'

const row: ApiKeyRow = {
  id: 'key_1',
  level: 'workspace',
  name: 'Sales CI',
  keyPrefix: 'ask_abcd',
  keySuffix: 'a71d',
  permissions: { workflows: ['read', 'deploy', 'run'] },
  createdBy: 'usr_tom',
  createdByName: 'Tom Okafor',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  projectId: 'prj_101',
  workspaceId: 'ws_sales',
  workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' },
}

describe('key rows → records', () => {
  it('shows the prefix and suffix as the key tables draw them, the creator as a person, the workspace as a chip', () => {
    expect(toApiKey(row)).toEqual({
      id: 'key_1',
      level: 'workspace',
      name: 'Sales CI',
      prefix: 'ask_abcd…a71d',
      permissions: { workflows: ['read', 'deploy', 'run'] },
      createdBy: { id: 'usr_tom', name: 'Tom Okafor' },
      createdAt: '2026-10-01T00:00:00.000Z',
      lastUsedAt: null,
      expiresAt: null,
      workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' },
    })
    // A key minted before B3 has no suffix.
    expect(toApiKey({ ...row, keySuffix: null, workspace: null, workspaceId: null }).prefix).toBe(
      'ask_abcd…',
    )
    expect(toApiKey({ ...row, createdByName: null }).createdBy.name).toBe('')
  })

  it('draws every page of a list, keeping the first page’s counts', async () => {
    const pages: Record<string, { data: ApiKeyRow[]; nextCursor: string | null }> = {
      first: { data: [row], nextCursor: 'c2' },
      c2: { data: [{ ...row, id: 'key_2' }], nextCursor: 'c3' },
      c3: { data: [{ ...row, id: 'key_3' }], nextCursor: null },
    }
    const fetchPage = vi.fn(async (cursor?: string) => ({
      ...pages[cursor ?? 'first']!,
      workspaceCounts: cursor ? [] : [{ workspace: row.workspace!, count: 1 }],
    }))
    const all = await allKeyPages(fetchPage)
    expect(all.data.map((k) => k.id)).toEqual(['key_1', 'key_2', 'key_3'])
    expect(all.nextCursor).toBeNull()
    expect(all.workspaceCounts).toEqual([{ workspace: row.workspace, count: 1 }])
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c2', 'c3'])
  })

  it('shapes the project page and the workspace tab', () => {
    const project = toProjectKeys({
      data: [{ ...row, level: 'project', workspaceId: null, workspace: null }],
      nextCursor: null,
      workspaceCounts: [
        { workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }, count: 2 },
      ],
    })
    expect(project.keys.map((k) => k.level)).toEqual(['project'])
    expect(project.workspaceKeys).toEqual([
      { workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }, count: 2 },
    ])
    const workspace = toWorkspaceKeys({ own: [row], inherited: [] })
    expect(workspace.own).toHaveLength(1)
    expect(workspace.inherited).toEqual([])
  })

  it('keeps the secret apart from the record, once', () => {
    const created = toCreatedKey({ ...row, key: 'ask_abcdefghijklmnopqrstuvwxyz0123456789a71d' })
    expect(created.secret).toBe('ask_abcdefghijklmnopqrstuvwxyz0123456789a71d')
    expect(created.key.prefix).toBe('ask_abcd…a71d')
    expect('key' in created.key).toBe(false)
  })

  it('addresses the create call at the level and turns the expiry choice into an instant', () => {
    const now = new Date('2026-10-29T12:00:00.000Z')
    expect(expiresAtOf('30', now)).toBe('2026-11-28T12:00:00.000Z')
    expect(expiresAtOf('never', now)).toBeNull()
    expect(
      toCreateKeyRequest('acme', {
        level: 'workspace',
        project: 'project-101',
        workspace: 'sales',
        name: ' CI ',
        expires: 'never',
        permissions: { workflows: ['run'] },
      }),
    ).toEqual({
      slugs: { org: 'acme', project: 'project-101', workspace: 'sales' },
      body: {
        name: 'CI',
        level: 'workspace',
        permissions: { workflows: ['run'] },
        expiresAt: null,
      },
    })
    expect(
      toCreateKeyRequest('acme', {
        level: 'organization',
        project: 'project-101',
        name: 'Org',
        expires: 'never',
        permissions: { projects: ['read'] },
      }).slugs,
    ).toEqual({ org: 'acme', project: undefined, workspace: undefined })
  })
})
