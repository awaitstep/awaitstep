import { transform } from 'sucrase'
import { compareVersions, mergeDefinition, semverProblem } from './definition.js'

export interface SchemaIssue {
  path: PropertyKey[]
  message: string
}

export interface DefinitionSchema {
  safeParse(
    value: unknown,
  ): { success: true; data: unknown } | { success: false; error: { issues: SchemaIssue[] } }
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  path: string
  message: string
}

export interface VersionInput {
  version: string
  overrides?: Record<string, unknown>
  node?: Record<string, unknown>
  templates: Record<string, string>
}

export interface NodeInput {
  id: string
  base?: Record<string, unknown>
  versions: VersionInput[]
  iconExists: boolean
}

const OVERRIDE_KEYS = new Set([
  'version',
  'description',
  'name',
  'category',
  'tags',
  'icon',
  'docsUrl',
  'configSchema',
  'outputSchema',
  'providers',
  'dependencies',
  'runtime',
  'deprecated',
  'deprecationMessage',
  'replacedBy',
])

const FORBIDDEN_TEMPLATE_PATTERNS: Array<[RegExp, string]> = [
  [/\bprocess\s*\./, 'Node process API is not available in a node template'],
  [/\bBuffer\b/, 'Node Buffer is not available in a node template'],
  [/\brequire\s*\(/, 'CommonJS require is not available in a node template'],
  [/\bconsole\s*\./, 'console is not allowed in a node template'],
  [/\beval\s*\(/, 'eval is not allowed in a node template'],
  [/\bnew\s+Function\s*\(/, 'new Function is not allowed in a node template'],
  [/\bimport\s*\(/, 'dynamic import is not allowed in a node template'],
  [
    /\bstep\.(?:do|sleep|sleepUntil|waitForEvent)\s*\(/,
    'templates must not call durable primitives',
  ],
]

function error(path: string, message: string): ValidationIssue {
  return { level: 'error', path, message }
}

function warning(path: string, message: string): ValidationIssue {
  return { level: 'warning', path, message }
}

function canonicalJson(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical)
    if (input !== null && typeof input === 'object') {
      const output: Record<string, unknown> = Object.create(null)
      for (const key of Object.keys(input as Record<string, unknown>).sort()) {
        const entry = (input as Record<string, unknown>)[key]
        if (entry !== undefined) output[key] = canonical(entry)
      }
      return output
    }
    return input
  }
  return JSON.stringify(canonical(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function outputFieldIssues(field: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(field)) return [error(path, 'output field must be an object')]
  // `object`/`array` without properties/items is the schema's free-form
  // shape (a provider response envelope). Enforce their type when present.
  if (field.type === 'object' && field.properties !== undefined) {
    if (!isRecord(field.properties)) {
      issues.push(error(path, 'object output field properties must be an object'))
    } else {
      for (const [name, property] of Object.entries(field.properties)) {
        issues.push(...outputFieldIssues(property, `${path}.properties.${name}`))
      }
    }
  }
  if (field.type === 'array' && field.items !== undefined) {
    if (!isRecord(field.items)) {
      issues.push(error(path, 'array output field items must be an object'))
    } else {
      issues.push(...outputFieldIssues(field.items, `${path}.items`))
    }
  }
  return issues
}

function outputSchemaIssues(schema: Record<string, unknown>, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const [name, field] of Object.entries(schema)) {
    issues.push(...outputFieldIssues(field, `${path}.${name}`))
  }
  return issues
}

function templateIssues(
  template: string,
  definition: Record<string, unknown>,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  try {
    transform(template, { transforms: ['typescript'], disableESTransforms: true })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return [error(path, `template does not parse: ${message}`)]
  }

  if (!/export\s+default\s+async\s+function/.test(template)) {
    issues.push(error(path, 'template must export a default async function'))
  }

  if (/ctx\.config(?!\.)/.test(template)) {
    issues.push(error(path, 'template reads ctx.config as a whole; read named fields only'))
  }
  if (/ctx\.env(?!\.)/.test(template)) {
    issues.push(error(path, 'template reads ctx.env as a whole; read named secrets only'))
  }

  const configSchema = isRecord(definition.configSchema) ? definition.configSchema : {}
  const configKeys = new Set(Object.keys(configSchema))
  const configRefs = unique(
    [...template.matchAll(/ctx\.config\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
  )
  for (const key of configRefs) {
    if (!configKeys.has(key)) {
      issues.push(error(path, `template reads ctx.config.${key}, which is not in configSchema`))
    }
  }

  const secretNames = new Set(
    Object.values(configSchema)
      .filter(isRecord)
      .filter((field) => field.type === 'secret')
      .map((field) => field.envVarName)
      .filter((name): name is string => typeof name === 'string'),
  )
  const envRefs = unique(
    [...template.matchAll(/ctx\.env\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
  )
  for (const name of envRefs) {
    if (!secretNames.has(name)) {
      issues.push(error(path, `template reads ctx.env.${name}, which has no secret envVarName`))
    }
  }

  const action = isRecord(configSchema.action) ? configSchema.action : undefined
  const options = Array.isArray(action?.options)
    ? action.options.filter((value): value is string => typeof value === 'string')
    : []
  const cases = unique([...template.matchAll(/case\s+['"]([^'"]+)['"]/g)].map((match) => match[1]))
  for (const value of cases) {
    if (!options.includes(value)) {
      issues.push(error(path, `template case "${value}" is not an action option`))
    }
  }
  for (const option of options) {
    if (!cases.includes(option)) {
      issues.push(error(path, `action option "${option}" has no template case`))
    }
  }

  const dependencies = isRecord(definition.dependencies) ? definition.dependencies : {}
  const imports = unique([
    ...[...template.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]),
    ...[...template.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ]).filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'))
  for (const specifier of imports) {
    const declared = Object.keys(dependencies).some(
      (dependency) => specifier === dependency || specifier.startsWith(`${dependency}/`),
    )
    if (!declared) {
      issues.push(error(path, `template imports ${specifier}, which is not in dependencies`))
    }
  }

  for (const [pattern, message] of FORBIDDEN_TEMPLATE_PATTERNS) {
    if (pattern.test(template)) issues.push(error(path, message))
  }

  return issues
}

export function validateNode(input: NodeInput, schema: DefinitionSchema): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const base = input.base

  if (!base) {
    issues.push(error(input.id, 'missing base.json'))
    return issues
  }
  if ('version' in base)
    issues.push(error(`${input.id}/base.json`, 'base.json must not contain version'))
  if ('description' in base) {
    issues.push(error(`${input.id}/base.json`, 'base.json must not contain description'))
  }
  if (base.id !== input.id) {
    issues.push(error(`${input.id}/base.json`, `id "${String(base.id)}" does not match directory`))
  }
  if (!input.iconExists) issues.push(error(input.id, 'missing icon.svg'))
  if (input.versions.length === 0) issues.push(error(input.id, 'no version directories'))

  const sorted = [...input.versions].sort((left, right) =>
    compareVersions(left.version, right.version),
  )
  for (let index = 0; index < sorted.length; index += 1) {
    const version = sorted[index]
    const path = `${input.id}@${version.version}`
    const semver = semverProblem(version.version)
    if (semver) issues.push(error(path, semver))
    if (index > 0 && compareVersions(sorted[index - 1].version, version.version) === 0) {
      issues.push(error(path, 'duplicate version'))
    }
    if (!version.overrides) {
      issues.push(error(path, 'missing overrides.json'))
      continue
    }
    for (const key of Object.keys(version.overrides)) {
      if (!OVERRIDE_KEYS.has(key)) {
        issues.push(error(`${path}/overrides.json`, `unsupported override key "${key}"`))
      }
    }
    if (version.overrides.version !== version.version) {
      issues.push(
        error(
          `${path}/overrides.json`,
          `version "${String(version.overrides.version)}" does not match directory`,
        ),
      )
    }
    if (typeof version.overrides.description !== 'string') {
      issues.push(error(`${path}/overrides.json`, 'description is required'))
    }

    const definition = mergeDefinition(base, version.overrides)
    const description = definition.description
    if (typeof description === 'string' && description.length > 120) {
      issues.push(error(path, `description is ${description.length} characters (max 120)`))
    }
    const docsUrl = definition.docsUrl
    if (version.version === sorted[sorted.length - 1]?.version) {
      if (typeof docsUrl !== 'string') {
        issues.push(error(path, 'docsUrl is required'))
      } else {
        try {
          new URL(docsUrl)
        } catch {
          issues.push(error(path, `docsUrl is not a valid URL: ${docsUrl}`))
        }
      }
    }
    const configSchema = isRecord(definition.configSchema) ? definition.configSchema : {}
    for (const [name, rawField] of Object.entries(configSchema)) {
      if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
        issues.push(error(`${path}/configSchema.${name}`, 'unsafe config field name'))
        continue
      }
      if (!isRecord(rawField)) continue
      if (rawField.type === 'secret' && typeof rawField.envVarName !== 'string') {
        issues.push(error(`${path}/configSchema.${name}`, 'secret field must have envVarName'))
      }
      if (
        (rawField.type === 'select' || rawField.type === 'multiselect') &&
        (!Array.isArray(rawField.options) || rawField.options.length === 0)
      ) {
        issues.push(
          error(`${path}/configSchema.${name}`, `${rawField.type} field must have options`),
        )
      }
    }
    if (version.node && canonicalJson(definition) !== canonicalJson(version.node)) {
      issues.push(
        warning(
          `${path}/node.json`,
          'generated node.json differs from merged base/overrides; CI will regenerate it',
        ),
      )
    }
    if (isRecord(definition.outputSchema)) {
      issues.push(...outputSchemaIssues(definition.outputSchema, `${path}/outputSchema`))
    }
    const parsed = schema.safeParse(definition)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push(error(path, `${issue.path.map(String).join('.')}: ${issue.message}`))
      }
      continue
    }

    if (definition.id !== input.id) {
      issues.push(error(path, `id "${String(definition.id)}" does not match directory`))
    }
    if (definition.version !== version.version) {
      issues.push(error(path, `version "${String(definition.version)}" does not match directory`))
    }

    const providers = Array.isArray(definition.providers)
      ? definition.providers.filter((value): value is string => typeof value === 'string')
      : []
    if (providers.length === 0) issues.push(error(path, 'providers is empty'))
    for (const provider of providers) {
      if (!/^[a-z][a-z0-9-]*$/.test(provider)) {
        issues.push(error(`${path}/providers`, `invalid provider id "${provider}"`))
      }
      if (!version.templates[provider]) {
        issues.push(error(path, `missing template for provider "${provider}"`))
      }
    }
    if (Object.keys(version.templates).length === 0) {
      issues.push(error(path, 'no templates found'))
    }

    for (const [provider, template] of Object.entries(version.templates)) {
      issues.push(...templateIssues(template, definition, `${path}/templates/${provider}.ts`))
    }
  }

  return issues
}
