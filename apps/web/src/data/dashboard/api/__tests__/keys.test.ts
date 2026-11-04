import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyRow } from '../../../../lib/dashboard-api'
import {
  expiresAtOf,
  toApiKey,
  toCreateKeyRequest,
  toCreatedKey,
  toProjectKeys,
  toWorkspaceKeys,
} from '../keys'
import { allPages } from '../pages'

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
  projects: [],
  workspaces: [
    {
      workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' },
      revokedAt: null,
    },
  ],
}

const projectRow: ApiKeyRow = {
  ...row,
  id: 'key_p',
  level: 'project',
  workspaces: [],
  projects: [
    {
      projectId: 'prj_101',
      projectName: 'Project 101',
      projectSlug: 'project-101',
      revokedAt: null,
    },
  ],
}

describe('key rows → records', () => {
  it('shows the prefix and suffix as the tables draw them, the creator as a person, the scope set with its revoked state', () => {
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
      projects: [],
      workspaces: [
        {
          workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' },
          revokedAt: null,
        },
      ],
    })
    // A key minted before B3 has no suffix.
    expect(toApiKey({ ...row, keySuffix: null, workspaces: [] }).prefix).toBe('ask_abcd…')
    expect(toApiKey({ ...row, createdByName: null }).createdBy.name).toBe('')
  })

  it('maps a project scope set, keeping each project’s revoked state', () => {
    const multi: ApiKeyRow = {
      ...projectRow,
      projects: [
        {
          projectId: 'prj_101',
          projectName: 'Project 101',
          projectSlug: 'project-101',
          revokedAt: null,
        },
        {
          projectId: 'prj_mk',
          projectName: 'Marketing',
          projectSlug: 'marketing',
          revokedAt: '2026-10-10T00:00:00.000Z',
        },
      ],
    }
    expect(toApiKey(multi).projects).toEqual([
      { id: 'prj_101', name: 'Project 101', slug: 'project-101', revokedAt: null },
      { id: 'prj_mk', name: 'Marketing', slug: 'marketing', revokedAt: '2026-10-10T00:00:00.000Z' },
    ])
  })

  it('draws every page of the org list (the org list still paginates)', async () => {
    const pages: Record<string, { data: ApiKeyRow[]; nextCursor: string | null }> = {
      first: { data: [row], nextCursor: 'c2' },
      c2: { data: [{ ...row, id: 'key_2' }], nextCursor: 'c3' },
      c3: { data: [{ ...row, id: 'key_3' }], nextCursor: null },
    }
    const fetchPage = vi.fn(async (cursor?: string) => pages[cursor ?? 'first']!)
    const all = await allPages(fetchPage)
    expect(all.data.map((k) => k.id)).toEqual(['key_1', 'key_2', 'key_3'])
    expect(all.nextCursor).toBeNull()
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'c2', 'c3'])
  })

  it('shapes the project page into own, reaching and workspace counts', () => {
    const project = toProjectKeys({
      own: [projectRow],
      reaching: [{ ...projectRow, id: 'key_r' }],
      workspaceCounts: [
        { workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }, count: 2 },
      ],
    })
    expect(project.own.map((k) => k.id)).toEqual(['key_p'])
    expect(project.reaching.map((k) => k.id)).toEqual(['key_r'])
    expect(project.workspaceKeys).toEqual([
      { workspace: { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }, count: 2 },
    ])
  })

  it('shapes the workspace tab into own and reaching', () => {
    const workspace = toWorkspaceKeys({ own: [row], reaching: [{ ...row, id: 'key_r' }] })
    expect(workspace.own.map((k) => k.id)).toEqual(['key_1'])
    expect(workspace.reaching.map((k) => k.id)).toEqual(['key_r'])
  })

  it('keeps the secret apart from the record, once', () => {
    const created = toCreatedKey({ ...row, key: 'ask_abcdefghijklmnopqrstuvwxyz0123456789a71d' })
    expect(created.secret).toBe('ask_abcdefghijklmnopqrstuvwxyz0123456789a71d')
    expect(created.key.prefix).toBe('ask_abcd…a71d')
    expect('key' in created.key).toBe(false)
  })

  it('addresses the create call at the home and turns the expiry choice into an instant', () => {
    const now = new Date('2026-10-29T12:00:00.000Z')
    expect(expiresAtOf('30', now)).toBe('2026-11-28T12:00:00.000Z')
    expect(expiresAtOf('never', now)).toBeNull()
    // A single-workspace key is addressed at its workspace, with no set in the body.
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
    // A multi-project key minted at the org carries its picked projectIds and no project slug.
    expect(
      toCreateKeyRequest('acme', {
        level: 'project',
        name: 'Platform',
        expires: 'never',
        permissions: { workflows: ['read'] },
        projectIds: ['prj_101', 'prj_mk'],
      }),
    ).toEqual({
      slugs: { org: 'acme', project: undefined, workspace: undefined },
      body: {
        name: 'Platform',
        level: 'project',
        permissions: { workflows: ['read'] },
        expiresAt: null,
        projectIds: ['prj_101', 'prj_mk'],
      },
    })
  })
})
