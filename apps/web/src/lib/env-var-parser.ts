import type { EnvVarSummary } from './api-client'

export const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/
export const SECRET_PREFIX = 'SECRET_'
export const MASKED_SECRET_VALUE = '••••••••'

/**
 * Splits the editor's `SECRET_` marker off a variable name.
 *
 * The prefix is how the browser carries "this one is secret" through a
 * plain name/value list; the API has a real `isSecret` field instead, so
 * every boundary between them does this.
 */
export function splitSecretName(displayName: string): { name: string; isSecret: boolean } {
  return displayName.startsWith(SECRET_PREFIX)
    ? { name: displayName.slice(SECRET_PREFIX.length), isSecret: true }
    : { name: displayName, isSecret: false }
}

/**
 * The exact inverse: how a variable from the API is named in the editor.
 *
 * The prefix goes on unconditionally. Skipping it for a name that already
 * starts with `SECRET_` looks tidier and silently renames the variable: a
 * secret stored as `SECRET_TOKEN` would load as `SECRET_TOKEN`, and the next
 * save would split that back to `TOKEN` and leave the deployed worker's
 * `env.SECRET_TOKEN` undefined.
 */
export function secretDisplayName(name: string, isSecret: boolean): string {
  return isSecret ? `${SECRET_PREFIX}${name}` : name
}

export interface ParsedLine {
  name: string
  value: string
  isSecret: boolean
  error?: string
}

export function envVarsToString(vars: EnvVarSummary[]): string {
  if (vars.length === 0) return ''
  return vars
    .map((v) => {
      const displayName = secretDisplayName(v.name, v.isSecret)
      return `${displayName}=${v.isSecret ? MASKED_SECRET_VALUE : v.value}`
    })
    .join('\n')
}

export function parseEnvString(text: string): ParsedLine[] {
  return text
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) {
        return { name: line.trim(), value: '', isSecret: false, error: 'Missing = separator' }
      }
      const rawName = line.slice(0, eqIdx).trim()
      const value = line.slice(eqIdx + 1).trim()
      const { name, isSecret } = splitSecretName(rawName)

      if (!NAME_PATTERN.test(rawName)) {
        return {
          name: rawName,
          value,
          isSecret,
          error: 'Name must be uppercase letters, digits, and underscores',
        }
      }
      return { name, value, isSecret, error: undefined }
    })
}
