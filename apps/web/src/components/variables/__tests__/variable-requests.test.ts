import { describe, expect, it } from 'vitest'
import type { ResolvedVariable, WorkspaceVariable } from '../../../types/dashboard/variables'
import { validateDashboardSearch } from '../../navigation/dashboard-providers'
import {
  orgDialogMode,
  projectDialogMode,
  variableRequestFrom,
  workspaceDialogMode,
} from '../variable-requests'

const resolved = (
  name: string,
  level: 'organization' | 'project',
  isSecret = false,
): ResolvedVariable => ({
  id: `project:${name}`,
  name,
  value: isSecret ? null : 'v',
  isSecret,
  setAt: { level, name: level === 'project' ? 'Project 101' : 'Acme Inc' },
  overriddenIn: [],
  reach: level === 'project' ? { all: true, places: [], blocked: [] } : null,
})

const inWorkspace = (
  name: string,
  level: 'organization' | 'project' | 'workspace',
): WorkspaceVariable => ({
  id: `${level}:${name}`,
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
      id: 'project:SLACK_TOKEN',
      name: 'SLACK_TOKEN',
      value: null,
      isSecret: true,
      reach: { all: true, places: [], blocked: [] },
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

describe('orgDialogMode', () => {
  const ORG = [
    {
      id: 'org:REGION',
      name: 'REGION',
      value: 'eu',
      isSecret: false,
      overriddenIn: 1,
      reach: { all: true, places: [], blocked: [] },
    },
    {
      id: 'org:SENTRY_DSN',
      name: 'SENTRY_DSN',
      value: null,
      isSecret: true,
      overriddenIn: 0,
      reach: { all: true, places: [], blocked: [] },
    },
  ]

  it('edits the org’s own variables, a secret starting empty', () => {
    expect(orgDialogMode({ kind: 'variable', name: 'REGION' }, ORG)).toEqual({
      kind: 'edit',
      id: 'org:REGION',
      name: 'REGION',
      value: 'eu',
      isSecret: false,
      reach: { all: true, places: [], blocked: [] },
    })
    expect(orgDialogMode({ kind: 'variable', name: 'SENTRY_DSN' }, ORG)).toMatchObject({
      kind: 'edit',
      value: null,
      isSecret: true,
    })
    expect(orgDialogMode({ kind: 'new' }, undefined)).toEqual({ kind: 'new' })
  })

  it('waits for the list, and opens nothing for an unknown name', () => {
    expect(orgDialogMode({ kind: 'variable', name: 'REGION' }, undefined)).toBeNull()
    expect(orgDialogMode({ kind: 'variable', name: 'NOPE' }, ORG)).toBeNull()
    expect(orgDialogMode(null, ORG)).toBeNull()
  })
})
