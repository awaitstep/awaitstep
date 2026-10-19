import { PROJECT_IMPORT_PREFIX } from '@awaitstep/ir'
import { parseJsonc } from '../jsonc'
import { workflowModelPath } from './setup'

/**
 * The compiler options that make one workflow's models a single program:
 * `baseUrl` is the workflow's model root, so `#app/<path>` maps onto the
 * model `<root>/<path>` exactly as the deployed package.json `imports` map
 * does, and relative imports between generated modules resolve the same
 * way. TypeScript's path utilities treat `scheme://authority/` as a root,
 * so a workflow's files can never resolve into another workflow's.
 */
export function projectRootOptions(workflowId: string): {
  baseUrl: string
  paths: Record<string, string[]>
} {
  return {
    baseUrl: workflowModelPath(workflowId, ''),
    paths: { [`${PROJECT_IMPORT_PREFIX}*`]: ['*'] },
  }
}

/**
 * The `compilerOptions` a project's root tsconfig.json may set for the
 * editor's type program. Only strictness-style switches are honoured: the
 * ones that change what the program contains or resolves (`paths`, `types`,
 * `lib`, `module`, …) stay with the workspace, so a tsconfig can never
 * detach the generated modules or the ambient Worker types.
 */
export const TSCONFIG_EDITOR_OPTIONS = [
  'strict',
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictPropertyInitialization',
  'noImplicitReturns',
  'noImplicitOverride',
  'noUnusedLocals',
  'noUnusedParameters',
  'noFallthroughCasesInSwitch',
  'exactOptionalPropertyTypes',
  'noUncheckedIndexedAccess',
  'checkJs',
] as const

export type TsconfigEditorOption = (typeof TSCONFIG_EDITOR_OPTIONS)[number]

/**
 * The honoured boolean switches from a tsconfig.json source, read as JSONC
 * (comments and trailing commas are conventional in tsconfig files).
 * Malformed input or non-boolean values contribute nothing.
 */
export function tsconfigEditorOptions(
  source: string | undefined,
): Partial<Record<TsconfigEditorOption, boolean>> {
  if (!source) return {}
  const parsed = parseJsonc(source)
  if (typeof parsed !== 'object' || parsed === null) return {}
  const compilerOptions = (parsed as { compilerOptions?: unknown }).compilerOptions
  if (typeof compilerOptions !== 'object' || compilerOptions === null) return {}
  const options: Partial<Record<TsconfigEditorOption, boolean>> = {}
  for (const key of TSCONFIG_EDITOR_OPTIONS) {
    const value = (compilerOptions as Record<string, unknown>)[key]
    if (typeof value === 'boolean') options[key] = value
  }
  return options
}
