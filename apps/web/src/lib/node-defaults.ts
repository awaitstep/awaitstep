import type { ConfigField } from '@awaitstep/ir'

/**
 * A new node's field values: each field's `default` from its `configSchema`.
 * The canvas drop and Code's Add both start a node from these.
 */
export function configDefaults(schema?: Record<string, ConfigField>): Record<string, unknown> {
  if (!schema) return {}
  const data: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema)) {
    if (field.default !== undefined) {
      data[key] = field.default
    }
  }
  return data
}
