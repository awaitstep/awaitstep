import type { WorkspaceColour } from '@awaitstep/ir'
import type {
  ApiOrgVariableRow,
  ApiResolvedProjectVariable,
  ApiResolvedWorkspaceVariable,
  ApiVariableRow,
} from '../../../lib/dashboard-api'
import type {
  OrgVariable,
  ResolvedVariable,
  VariableInput,
  VariableScope,
  WorkspaceVariable,
} from '../../../types/dashboard/variables'

// Variable rows → the records the Variables pages render. The API already
// resolved each name and masked secrets; this hides a secret's value
// altogether (the tables draw the mask themselves) and shapes the places.

const SECRET_MASK = '••••••••'

function valueOf(row: ApiVariableRow): string | null {
  return row.isSecret || row.value === SECRET_MASK ? null : row.value
}

export function toOrgVariable(row: ApiOrgVariableRow): OrgVariable {
  return {
    id: row.id,
    name: row.name,
    value: valueOf(row),
    isSecret: row.isSecret,
    overriddenIn: row.overriddenIn,
  }
}

export function toResolvedVariable(row: ApiResolvedProjectVariable): ResolvedVariable {
  return {
    id: row.id,
    name: row.name,
    value: valueOf(row),
    isSecret: row.isSecret,
    setAt: {
      level: row.setAt.level === 'project' ? 'project' : 'organization',
      name: row.setAt.name ?? '',
    },
    overriddenIn: row.overriddenIn.map((w) => ({ ...w, colour: w.colour as WorkspaceColour })),
  }
}

export function toWorkspaceVariable(row: ApiResolvedWorkspaceVariable): WorkspaceVariable {
  return {
    id: row.id,
    name: row.name,
    value: valueOf(row),
    isSecret: row.isSecret,
    source: { level: row.source.level, name: row.source.name ?? '' },
    overrides: row.overrides,
  }
}

/** The level's address for a variable call, from the scope a dialog or page names. */
export function variableSlugs(org: string, scope: VariableScope) {
  return {
    org,
    project: scope.level === 'organization' ? undefined : scope.project,
    workspace: scope.level === 'workspace' ? scope.workspace : undefined,
  }
}

/** Whether an edit leaves a secret's stored value alone: the value empty, the secret kept. */
export function keepsStoredValue(input: VariableInput): boolean {
  return input.value === '' && input.wasSecret === true && input.isSecret
}

/**
 * The body of an edit: a secret edited with the value left empty keeps the
 * stored one, so `value` is left out. Any other empty value is the caller's
 * to refuse before the request (`blankValueError`).
 */
export function toUpdateBody(input: VariableInput): { value?: string; isSecret: boolean } {
  return keepsStoredValue(input)
    ? { isSecret: input.isSecret }
    : { value: input.value, isSecret: input.isSecret }
}

/** What an empty value is refused with, on the value field: the dummy server's words. */
export function blankValueError(input: VariableInput): string | null {
  if (input.value !== '' || keepsStoredValue(input)) return null
  return input.wasSecret ? 'Enter the value to stop hiding it' : 'Give it a value'
}
