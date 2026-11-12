import type { ConfigField, OutputField } from '@awaitstep/ir'

// node.json is typed by hand and read on every keystroke (the ctx types, the
// canvas preview). Valid JSON can still hold any shape, so only fields that
// look like the schema's pass; publish reports the rest.

const CONFIG_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'select',
  'multiselect',
  'secret',
  'code',
  'json',
  'expression',
  'textarea',
])
const OUTPUT_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The config fields with a known type; `options` kept only as a list of strings. */
export function safeConfigSchema(raw: unknown): Record<string, ConfigField> {
  if (!isRecord(raw)) return {}
  const fields: Record<string, ConfigField> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value) || typeof value.type !== 'string' || !CONFIG_TYPES.has(value.type))
      continue
    const options =
      Array.isArray(value.options) && value.options.every((o) => typeof o === 'string')
        ? (value.options as string[])
        : undefined
    fields[key] = {
      type: value.type,
      label: typeof value.label === 'string' ? value.label : key,
      ...(typeof value.description === 'string' && { description: value.description }),
      ...(value.required === true && { required: true }),
      ...('default' in value && { default: value.default }),
      ...(typeof value.placeholder === 'string' && { placeholder: value.placeholder }),
      ...(options && { options }),
      ...(isRecord(value.validation) && { validation: value.validation }),
    } as ConfigField
  }
  return fields
}

/** The output fields with a known type, nested `items` and `properties` checked the same way. */
export function safeOutputSchema(raw: unknown): Record<string, OutputField> {
  if (!isRecord(raw)) return {}
  const fields: Record<string, OutputField> = {}
  for (const [key, value] of Object.entries(raw)) {
    const field = safeOutputField(value)
    if (field) fields[key] = field
  }
  return fields
}

function safeOutputField(value: unknown): OutputField | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !OUTPUT_TYPES.has(value.type)) {
    return null
  }
  const items = value.items === undefined ? undefined : safeOutputField(value.items)
  return {
    type: value.type,
    ...(typeof value.description === 'string' && { description: value.description }),
    ...(value.nullable === true && { nullable: true }),
    ...(items && { items }),
    ...(isRecord(value.properties) && { properties: safeOutputSchema(value.properties) }),
  } as OutputField
}
