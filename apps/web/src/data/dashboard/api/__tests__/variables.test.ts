import { describe, expect, it } from 'vitest'
import type {
  ApiOrgVariableRow,
  ApiResolvedProjectVariable,
  ApiResolvedWorkspaceVariable,
} from '../../../../lib/dashboard-api'
import {
  blankValueError,
  toOrgVariable,
  toResolvedVariable,
  toUpdateBody,
  toWorkspaceVariable,
  variableSlugs,
} from '../variables'

const base = {
  organizationId: 'org_1',
  projectId: null,
  workspaceId: null,
  createdBy: 'usr_1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

describe('variable rows → records', () => {
  it('keeps an org row’s override count and hides a secret’s masked value', () => {
    const row: ApiOrgVariableRow = {
      ...base,
      id: 'v_1',
      level: 'organization',
      name: 'SENTRY_DSN',
      value: '••••••••',
      isSecret: true,
      overriddenIn: 2,
    }
    expect(toOrgVariable(row)).toEqual({
      id: 'v_1',
      name: 'SENTRY_DSN',
      value: null,
      isSecret: true,
      overriddenIn: 2,
    })
  })

  it('shapes a project’s resolved row: where it is set and the overriding workspaces as chips', () => {
    const row: ApiResolvedProjectVariable = {
      ...base,
      id: 'v_2',
      level: 'organization',
      name: 'REGION',
      value: 'eu',
      isSecret: false,
      setAt: { level: 'organization', id: 'org_1', name: 'Acme' },
      overriddenIn: [{ id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }],
    }
    expect(toResolvedVariable(row)).toEqual({
      id: 'v_2',
      name: 'REGION',
      value: 'eu',
      isSecret: false,
      setAt: { level: 'organization', name: 'Acme' },
      overriddenIn: [{ id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'blue' }],
    })
  })

  it('shapes a workspace’s resolved row: its source and what it overrides', () => {
    const row: ApiResolvedWorkspaceVariable = {
      ...base,
      id: 'v_3',
      level: 'workspace',
      projectId: 'p_1',
      workspaceId: 'ws_sales',
      name: 'REGION',
      value: 'apac',
      isSecret: false,
      source: { level: 'workspace', id: 'ws_sales', name: 'Sales' },
      overrides: 'organization',
    }
    expect(toWorkspaceVariable(row)).toEqual({
      id: 'v_3',
      name: 'REGION',
      value: 'apac',
      isSecret: false,
      source: { level: 'workspace', name: 'Sales' },
      overrides: 'organization',
    })
  })

  it('addresses a call at the scope’s level, and leaves a kept secret’s value out of an edit', () => {
    expect(variableSlugs('acme', { level: 'organization' })).toEqual({
      org: 'acme',
      project: undefined,
      workspace: undefined,
    })
    expect(variableSlugs('acme', { level: 'workspace', project: 'p', workspace: 'sales' })).toEqual(
      {
        org: 'acme',
        project: 'p',
        workspace: 'sales',
      },
    )
    const edit = {
      scope: { level: 'project' as const, project: 'p' },
      name: 'X',
      mode: 'edit' as const,
    }
    expect(toUpdateBody({ ...edit, value: '', isSecret: true, wasSecret: true })).toEqual({
      isSecret: true,
    })
    expect(toUpdateBody({ ...edit, value: 'new', isSecret: false })).toEqual({
      value: 'new',
      isSecret: false,
    })
  })

  it('refuses a blank value unless it keeps a secret, in the dummy server’s words', () => {
    const edit = {
      scope: { level: 'project' as const, project: 'p' },
      name: 'X',
      mode: 'edit' as const,
    }
    // A secret kept: nothing to refuse.
    expect(blankValueError({ ...edit, value: '', isSecret: true, wasSecret: true })).toBeNull()
    // Un-hiding needs the value typed; a plain value cannot be blanked; a create needs one.
    expect(blankValueError({ ...edit, value: '', isSecret: false, wasSecret: true })).toBe(
      'Enter the value to stop hiding it',
    )
    expect(blankValueError({ ...edit, value: '', isSecret: false, wasSecret: false })).toBe(
      'Give it a value',
    )
    expect(blankValueError({ ...edit, mode: 'create', value: '', isSecret: false })).toBe(
      'Give it a value',
    )
    expect(blankValueError({ ...edit, value: 'x', isSecret: false })).toBeNull()
  })
})
