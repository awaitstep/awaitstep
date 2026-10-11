import type { OutputField } from '@awaitstep/ir'

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Property-position spelling for a key in emitted d.ts: bare when it is a
 * valid identifier, JSON-quoted otherwise. */
export function propertyKey(key: string): string {
  return IDENTIFIER_RE.test(key) ? key : JSON.stringify(key)
}

/** Neutralizes `*\/` so interpolated text can never terminate a JSDoc block
 * and leak tokens into the emitted declaration scope. */
export function escapeJsdoc(text: string): string {
  return text.replace(/\*\//g, '*\\/')
}

function needsParens(type: string): boolean {
  return type.includes('|') || type.includes('=>')
}

/**
 * TypeScript type text for one registry output field. Union members
 * (nullable) are parenthesized when used as array elements so `(string |
 * null)[]` round-trips correctly.
 */
export function outputFieldToType(field: OutputField, indent = ''): string {
  let base: string
  switch (field.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'null':
      base = field.type
      break
    case 'array': {
      if (field.items) {
        const item = outputFieldToType(field.items, indent)
        base = needsParens(item) ? `(${item})[]` : `${item}[]`
      } else {
        base = 'unknown[]'
      }
      break
    }
    case 'object':
      base = field.properties ? objectTypeBody(field.properties, indent) : 'Record<string, unknown>'
      break
    default:
      base = 'unknown'
  }
  return field.nullable ? `${base} | null` : base
}

function objectTypeBody(properties: Record<string, OutputField>, indent: string): string {
  const inner = indent + '  '
  const lines: string[] = ['{']
  for (const [key, field] of Object.entries(properties)) {
    if (field.description) {
      lines.push(`${inner}/** ${escapeJsdoc(field.description)} */`)
    }
    lines.push(`${inner}${propertyKey(key)}: ${outputFieldToType(field, inner)};`)
  }
  lines.push(`${indent}}`)
  return lines.join('\n')
}

/**
 * TypeScript type text for a node definition's `outputSchema` — the shape a
 * node's step result variable carries in generated code. Descriptions become
 * JSDoc so editors surface them on hover. An empty schema yields `unknown`
 * (the node declares it returns nothing usable). Browser-safe and
 * dependency-free: the web editor's ambient context and the CLI's generated
 * d.ts both consume it.
 */
export function outputSchemaToType(
  schema: Record<string, OutputField> | undefined,
  indent = '',
): string {
  if (!schema || Object.keys(schema).length === 0) return 'unknown'
  return objectTypeBody(schema, indent)
}
