import type { ResolvedVariable, WorkspaceVariable } from '../../types/dashboard/variables'
import type { VariableDialogMode } from './variable-dialog'

/** Which variable dialog the URL asks for: `?new=variable`, `?variable=NAME`. */
export type VariableRequest = { kind: 'new' } | { kind: 'variable'; name: string }

export function variableRequestFrom(search: {
  new?: string
  variable?: string
}): VariableRequest | null {
  if (search.variable) return { kind: 'variable', name: search.variable }
  return search.new === 'variable' ? { kind: 'new' } : null
}

/**
 * On project Variables: a variable the project sets opens Edit; one inherited
 * from the org opens Override (D-P6-5, -6). Null until the list is here.
 */
export function projectDialogMode(
  request: VariableRequest | null,
  list: ResolvedVariable[] | undefined,
): VariableDialogMode | null {
  if (!request) return null
  if (request.kind === 'new') return { kind: 'new' }
  const variable = list?.find((v) => v.name === request.name)
  if (!variable) return null
  // Where it's set decides: set here → Edit; inherited → Override.
  if (variable.setAt.level === 'organization') {
    return { kind: 'override', name: variable.name, isSecret: variable.isSecret }
  }
  return { kind: 'edit', name: variable.name, value: variable.value, isSecret: variable.isSecret }
}

/** On workspace Variables: its own value opens Edit; an inherited one opens Override. */
export function workspaceDialogMode(
  request: VariableRequest | null,
  list: WorkspaceVariable[] | undefined,
): VariableDialogMode | null {
  if (!request) return null
  if (request.kind === 'new') return { kind: 'new' }
  const variable = list?.find((v) => v.name === request.name)
  if (!variable) return null
  // Where it's set decides: set in the workspace → Edit; inherited → Override.
  if (variable.source.level !== 'workspace') {
    return { kind: 'override', name: variable.name, isSecret: variable.isSecret }
  }
  return { kind: 'edit', name: variable.name, value: variable.value, isSecret: variable.isSecret }
}
