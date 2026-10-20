// A workflow variable whose value names a project variable instead of
// holding one. Exact by design: the form below is what resolution accepts,
// so anything looser would count as a reference in one place and arrive
// somewhere else as a literal string of braces.
const GLOBAL_ENV_REF = /^\{\{global\.env\.([A-Z][A-Z0-9_]*)\}\}$/

/**
 * The project variable a workflow variable's value refers to, or null when
 * the value is a literal.
 */
export function globalEnvRefName(value: string): string | null {
  return GLOBAL_ENV_REF.exec(value)?.[1] ?? null
}

/**
 * Whether a workflow variable's value is resolved from the project rather
 * than held as written. A reference has no value until the workflow is
 * prepared, so anything reading it before then — an editor, a browser-side
 * test — is holding a placeholder.
 */
export function isGlobalEnvRef(value: string): boolean {
  return globalEnvRefName(value) !== null
}
