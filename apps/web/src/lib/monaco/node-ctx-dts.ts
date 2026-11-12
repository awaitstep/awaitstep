import { escapeJsdoc, outputSchemaToType, propertyKey } from '@awaitstep/codegen'
import type { ConfigField, OutputField } from '@awaitstep/ir'
import { safeConfigSchema, safeOutputSchema } from '../library/node-schema-guard'

function literalUnion(options: readonly string[] | undefined): string {
  if (!options || options.length === 0) return 'string'
  return options.map((option) => JSON.stringify(option)).join(' | ')
}

/** The value a config field holds when the template reads it. */
export function configFieldType(field: ConfigField): string {
  switch (field.type) {
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'select':
      return literalUnion(field.options)
    case 'multiselect':
      return `Array<${literalUnion(field.options)}>`
    case 'json':
      return 'unknown'
    default:
      return 'string'
  }
}

function configType(schema: Record<string, ConfigField>): string {
  const keys = Object.keys(schema)
  if (keys.length === 0) return 'Record<string, never>'
  const lines = ['{']
  for (const key of keys) {
    const field = schema[key]!
    const doc = field.description ?? field.label
    if (doc) lines.push(`    /** ${escapeJsdoc(doc)} */`)
    // A field that may be left empty reaches the template as undefined.
    const optional = field.required || field.default !== undefined ? '' : '?'
    lines.push(`    ${propertyKey(key)}${optional}: ${configFieldType(field)};`)
  }
  lines.push('  }')
  return lines.join('\n')
}

/**
 * `ctx.d.ts` for one custom-node version folder (D6): `Ctx` types what the
 * template reads (`config` from `configSchema`, `env`, `inputs`), `Output`
 * what it returns (from `outputSchema`). Drawn from the folder's node.json
 * as edited; a node.json that does not parse gives loose types rather than
 * none, so the template never turns red for a typo in the manifest.
 */
const LOOSE_CTX_DTS = [
  '// node.json does not parse yet: the types are loose until it does.',
  'export interface Ctx { config: Record<string, any>; env: Record<string, string>; inputs: Record<string, unknown> }',
  'export type Output = any',
  '',
].join('\n')

export function buildNodeCtxDts(nodeJson: string | undefined): string {
  // The whole build is guarded: a hand-typed (or a coworker's) node.json of
  // any shape or depth gives loose types, never a crash of the editor.
  try {
    const parsed = JSON.parse(nodeJson ?? '') as {
      configSchema?: unknown
      outputSchema?: unknown
    } | null
    // Only fields shaped like the schema's: the file is mid-edit as often as not.
    const config: Record<string, ConfigField> = safeConfigSchema(parsed?.configSchema)
    const output: Record<string, OutputField> = safeOutputSchema(parsed?.outputSchema)
    return [
      '// Drawn from node.json by the editor. Never stored or published.',
      'export interface Ctx {',
      '  /** The node’s settings, as configSchema declares them. */',
      `  config: ${configType(config)}`,
      '  /** The workflow’s env vars and secrets. */',
      '  env: Record<string, string>',
      '  /** Values wired in from earlier steps. */',
      '  inputs: Record<string, unknown>',
      '}',
      '',
      '/** What the template returns, as outputSchema declares it. */',
      `export type Output = ${outputSchemaToType(output)}`,
      '',
    ].join('\n')
  } catch {
    return LOOSE_CTX_DTS
  }
}
