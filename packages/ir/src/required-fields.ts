import type { ConfigField } from './node-definition.js'

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * The required fields a node's data leaves empty, as field ids in schema
 * order. Empty is unset, null, blank text or an empty list; `0` and `false`
 * are values. A secret is filled from the environment at deploy, so it never
 * counts as missing here.
 */
export function missingRequiredFields(
  schema: Record<string, ConfigField> | undefined,
  data: Record<string, unknown>,
): string[] {
  if (!schema) return []
  const missing: string[] = []
  for (const [fieldId, field] of Object.entries(schema)) {
    if (!field.required) continue
    // A secret is never typed into a node: it comes from the environment,
    // which Deploy's env check covers.
    if (field.type === 'secret') continue
    if (isEmpty(Object.hasOwn(data, fieldId) ? data[fieldId] : undefined)) missing.push(fieldId)
  }
  return missing
}
