import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName, sanitizeIdentifier, indent } from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function extractTemplateBody(source: string): string {
  const match = source.match(/export\s+default\s+async\s+function\s*[^(]*\([^)]*\)\s*\{/)
  if (!match) {
    throw new Error('Template must contain an `export default async function`')
  }

  const startIndex = match.index! + match[0].length
  let depth = 1
  let i = startIndex

  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') depth--
    i++
  }

  if (depth !== 0) {
    throw new Error('Unmatched braces in template function')
  }

  return source.slice(startIndex, i - 1).trim()
}

const ENV_REF_BRACED = /^\{\{env\.([A-Z][A-Z0-9_]*)\}\}$/
const ENV_REF_BARE = /^env\.([A-Z][A-Z0-9_]*)$/

export function toJsLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    const envMatch = value.match(ENV_REF_BRACED) ?? value.match(ENV_REF_BARE)
    if (envMatch) return `env.${envMatch[1]}`
    if (/\$\{.*?\}/.test(value)) {
      return '`' + value.replace(/`/g, '\\`') + '`'
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export function resolveCtxConfig(body: string, data: Record<string, unknown>): string {
  return body.replace(/ctx\.config\.(\w+(?:\.\w+)*)/g, (_match, path: string) => {
    const parts = path.split('.')
    let current: unknown = data
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return 'null'
      current = (current as Record<string, unknown>)[part]
    }
    return toJsLiteral(current)
  })
}

export function resolveCtxEnv(body: string): string {
  return body.replace(/ctx\.env\./g, 'env.')
}

export function resolveCtxInputs(body: string, data: Record<string, unknown>): string {
  return body.replace(/ctx\.inputs\.(\w+(?:\.\w+)*)/g, (_match, path: string) => {
    const parts = path.split('.')
    let current: unknown = data
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') return 'null'
      current = (current as Record<string, unknown>)[part]
    }
    if (typeof current === 'string') return current
    return toJsLiteral(current)
  })
}

function extractImportLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /^\s*import\s+/.test(line) && /from\s+['"]/.test(line))
    .map((line) => line.trim())
}

function toClassName(nodeType: string): string {
  return sanitizeIdentifier(nodeType)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

export interface CustomNodeOutput {
  classDefinition: string
  stepCode: string
  imports: string[]
  className: string
}

export function generateCustomNode(node: WorkflowNode, templateSource: string): string {
  const result = generateCustomNodeParts(node, templateSource)
  const parts: string[] = []
  if (result.imports.length > 0) parts.push(result.imports.join('\n'))
  parts.push(result.classDefinition)
  parts.push(result.stepCode)
  return parts.join('\n')
}

export function generateCustomNodeParts(
  node: WorkflowNode,
  templateSource: string,
): CustomNodeOutput {
  const imports = extractImportLines(templateSource)
  let body = extractTemplateBody(templateSource)
  const className = toClassName(node.type)

  // Replace ctx.env.* with env.* (env is passed as a parameter)
  body = resolveCtxEnv(body)

  // Replace ctx.config.* with params.* (params is passed as a parameter)
  body = body.replace(/ctx\.config\./g, 'params.')

  // Replace ctx.inputs.* with params.* (inputs are merged into params)
  body = body.replace(/ctx\.inputs\./g, 'params.')

  // Build the params object from node data
  const configData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.data)) {
    const paramKey = key.startsWith('input_') ? key.slice(6) : key
    configData[paramKey] = value
  }

  const paramsEntries = Object.entries(configData)
    .map(([key, value]) => `    ${key}: ${toJsLiteral(value)},`)
    .join('\n')

  const classDefinition = `class ${className} {
  static async execute(env: Env, params: Record<string, unknown>) {
${indent(body, 4)}
  }
}`

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(body)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''

  const stepCode = `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  return ${className}.execute(this.env, {
${paramsEntries}
  });
});`

  return { classDefinition, stepCode, imports, className }
}
