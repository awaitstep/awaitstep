import { describe, expect, it } from 'vitest'
import type { ResolvedVariable, WorkspaceVariable } from '../../../types/dashboard/variables'
import { validateDashboardSearch } from '../../navigation/dashboard-providers'
import { projectDialogMode, variableRequestFrom, workspaceDialogMode } from '../variable-requests'

const resolved = (
  name: string,
  level: 'organization' | 'project',
  isSecret = false,
): ResolvedVariable => ({
  name,
  value: isSecret ? null : 'v',
  isSecret,
  setAt: { level, name: level === 'project' ? 'Project 101' : 'Acme Inc' },
  overriddenIn: [],
})

const inWorkspace = (
  name: string,
  level: 'organization' | 'project' | 'workspace',
): WorkspaceVariable => ({
  name,
  value: 'v',
  isSecret: false,
  source: { level, name: level },
  overrides: null,
})

describe('variableRequestFrom', () => {
  it('reads the URL the router hands back, numbers and booleans included', () => {
    // The router JSON-parses `?variable=true` into a boolean.
    expect(variableRequestFrom(validateDashboardSearch({ variable: true }))).toEqual({
      kind: 'variable',
      name: 'true',
    })
    expect(variableRequestFrom(validateDashboardSearch({ new: 'variable' }))).toEqual({
      kind: 'new',
    })
    expect(variableRequestFrom(validateDashboardSearch({}))).toBeNull()
  })
})

describe('projectDialogMode', () => {
  it('edits a variable the project sets and overrides one it inherits', () => {
    const list = [resolved('SLACK_TOKEN', 'project', true), resolved('REGION', 'organization')]
    expect(projectDialogMode({ kind: 'variable', name: 'SLACK_TOKEN' }, list)).toEqual({
      kind: 'edit',
      name: 'SLACK_TOKEN',
      value: null,
      isSecret: true,
    })
    expect(projectDialogMode({ kind: 'variable', name: 'REGION' }, list)).toMatchObject({
      kind: 'override',
    })
  })

  it('waits for the list, and opens nothing for an unknown name', () => {
    expect(projectDialogMode({ kind: 'variable', name: 'X' }, undefined)).toBeNull()
    expect(projectDialogMode({ kind: 'variable', name: 'X' }, [])).toBeNull()
    expect(projectDialogMode({ kind: 'new' }, undefined)).toEqual({ kind: 'new' })
  })
})

describe('workspaceDialogMode', () => {
  it('edits the workspace’s own values and overrides inherited ones', () => {
    const list = [inWorkspace('CRM_BASE_URL', 'workspace'), inWorkspace('SLACK_TOKEN', 'project')]
    expect(workspaceDialogMode({ kind: 'variable', name: 'CRM_BASE_URL' }, list)).toMatchObject({
      kind: 'edit',
    })
    expect(workspaceDialogMode({ kind: 'variable', name: 'SLACK_TOKEN' }, list)).toMatchObject({
      kind: 'override',
    })
  })
})
