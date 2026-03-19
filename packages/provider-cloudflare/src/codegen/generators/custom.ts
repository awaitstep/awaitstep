import type { WorkflowNode } from '@awaitstep/ir'
import { varName, escName } from '@awaitstep/codegen'
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

export function generateCustomNode(node: WorkflowNode, templateSource: string): string {
  let body = extractTemplateBody(templateSource)

  const configData: Record<string, unknown> = {}
  const inputData: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(node.data)) {
    if (key.startsWith('input_')) {
      inputData[key.slice(6)] = value
    } else {
      configData[key] = value
    }
  }

  body = resolveCtxConfig(body, configData)
  body = resolveCtxEnv(body)
  body = resolveCtxInputs(body, inputData)

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(body)
  const prefix = hasReturn ? `const ${varName(node.id)} = ` : ''

  return `${prefix}await step.do("${escName(node.name)}"${configArg}, async () => {
  ${body}
});`
}
