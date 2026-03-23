import type { EnvVarSummary } from './api-client'

export const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/
export const SECRET_PREFIX = 'SECRET_'

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
      const displayName = v.isSecret && !v.name.startsWith(SECRET_PREFIX)
        ? `${SECRET_PREFIX}${v.name}`
        : v.name
      return `${displayName}=${v.isSecret ? '••••••••' : v.value}`
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
      const isSecret = rawName.startsWith(SECRET_PREFIX)
      const name = isSecret ? rawName.slice(SECRET_PREFIX.length) : rawName

      if (!NAME_PATTERN.test(rawName)) {
        return { name: rawName, value, isSecret, error: 'Name must be uppercase letters, digits, and underscores' }
      }
      return { name, value, isSecret, error: undefined }
    })
}
