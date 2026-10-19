/**
 * Declarations for JSON project files. The TypeScript worker treats any
 * model that is not .ts/.js as JavaScript, so a `.json` file laid into the
 * program would parse as an expression and export nothing. TypeScript
 * resolves `x.json` imports through `x.d.json.ts` first, so each JSON file
 * is given a declaration whose type is derived from its content.
 */

const MAX_DEPTH = 6
const MAX_KEYS = 200
const MAX_UNION = 8

/** A TypeScript type describing `value`, bounded so a huge data file stays cheap. */
export function jsonTypeOf(value: unknown, depth = 0): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (depth >= MAX_DEPTH) return 'unknown'
  if (Array.isArray(value)) {
    const members = [...new Set(value.map((item) => jsonTypeOf(item, depth + 1)))]
    if (members.length === 0) return 'never[]'
    if (members.length > MAX_UNION) return 'unknown[]'
    return members.length === 1 ? `${members[0]}[]` : `(${members.join(' | ')})[]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > MAX_KEYS) return 'Record<string, unknown>'
    if (entries.length === 0) return '{}'
    const fields = entries.map(
      ([key, item]) => `${JSON.stringify(key)}: ${jsonTypeOf(item, depth + 1)}`,
    )
    return `{ ${fields.join('; ')} }`
  }
  return 'unknown'
}

/** The `.d.json.ts` module for a JSON source, or null while the source is not valid JSON. */
export function jsonDeclaration(source: string): string | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  return `declare const value: ${jsonTypeOf(value)};\nexport default value;\n`
}

/** `data/countries.json` → `data/countries.d.json.ts`, where TypeScript looks first. */
export function jsonDeclarationPath(path: string): string {
  return path.replace(/\.json$/i, '.d.json.ts')
}
