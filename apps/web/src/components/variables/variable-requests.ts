import type {
  OrgVariable,
  ResolvedVariable,
  WorkspaceVariable,
} from '../../types/dashboard/variables'
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

/** What a variable dialog needs from a listed variable. */
interface ListedVariable {
  name: string
  value: string | null
  isSecret: boolean
}

/**
 * The dialog the URL asks for, once the list is here: a variable set at the
 * page's level opens Edit, one inherited from above opens Override (D-P6-5,
 * -6). Null until the list arrives, and for a name not in it.
 */
function dialogModeFor<V extends ListedVariable>(
  request: VariableRequest | null,
  list: V[] | undefined,
  isInherited: (variable: V) => boolean,
): VariableDialogMode | null {
  if (!request) return null
  if (request.kind === 'new') return { kind: 'new' }
  const variable = list?.find((v) => v.name === request.name)
  if (!variable) return null
  if (isInherited(variable)) {
    return { kind: 'override', name: variable.name, isSecret: variable.isSecret }
  }
  return { kind: 'edit', name: variable.name, value: variable.value, isSecret: variable.isSecret }
}

/** On project Variables: the project's own values open Edit; the org's open Override. */
export function projectDialogMode(
  request: VariableRequest | null,
  list: ResolvedVariable[] | undefined,
): VariableDialogMode | null {
  return dialogModeFor(request, list, (v) => v.setAt.level === 'organization')
}

/** On workspace Variables: its own values open Edit; inherited ones open Override. */
export function workspaceDialogMode(
  request: VariableRequest | null,
  list: WorkspaceVariable[] | undefined,
): VariableDialogMode | null {
  return dialogModeFor(request, list, (v) => v.source.level !== 'workspace')
}

/** On Resources → Variables: every variable listed is the org's own, so it opens Edit. */
export function orgDialogMode(
  request: VariableRequest | null,
  list: OrgVariable[] | undefined,
): VariableDialogMode | null {
  return dialogModeFor(request, list, () => false)
}
