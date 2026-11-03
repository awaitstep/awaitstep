import type { WorkflowNode } from '@awaitstep/ir'
import {
  GenerateInputError,
  stepLabel,
  sanitizeIdentifier,
  indent,
  type GenerateMode,
  type GenerationContext,
} from '@awaitstep/codegen'
import { generateStepConfig } from './config.js'

export function extractTemplateBody(source: string): string {
  const match = source.match(/export\s+default\s+async\s+function\s*[^(]*\([^)]*\)\s*\{/)
  if (!match) {
    throw new GenerateInputError(
      'Template must contain an `export default async function`',
      'provider',
    )
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
    throw new GenerateInputError('Unmatched braces in template function', 'provider')
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
  if (Array.isArray(value)) {
    return `[${value.map((v) => toJsLiteral(v)).join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toJsLiteral(v)}`)
      .join(', ')
    return `{ ${entries} }`
  }
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
  const lines = source.split('\n')
  const imports: string[] = []
  let pending: string[] | null = null

  for (const line of lines) {
    if (pending) {
      pending.push(line)
      if (/from\s+['"]/.test(line)) {
        imports.push(pending.join('\n').trim())
        pending = null
      }
    } else if (/^\s*import\s+/.test(line)) {
      if (/from\s+['"]/.test(line)) {
        imports.push(line.trim())
      } else {
        pending = [line]
      }
    }
  }

  return imports
}

function toClassName(nodeType: string): string {
  const base = sanitizeIdentifier(nodeType)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return `${base}Node`
}

export interface CustomNodeOutput {
  classDefinition: string
  stepCode: string
  imports: string[]
  className: string
}

export function generateCustomNode(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
): string {
  const result = generateCustomNodeParts(node, templateSource, ctx, mode)
  const parts: string[] = []
  if (result.imports.length > 0) parts.push(result.imports.join('\n'))
  parts.push(result.classDefinition)
  parts.push(result.stepCode)
  return parts.join('\n')
}

/**
 * Module mode: the custom node's template class and its invocation become a
 * standalone file with explicit `{ env, event, inputs, step }` params —
 * mirroring step modules. The class lives inside the module (no entry-level
 * hoisting or dedup needed; module scope isolates it), `env` arrives as a
 * parameter so the entry's legacy `env.` → `this.env.` rewrite never touches
 * template code, and upstream vars referenced by config template literals are
 * destructured from `inputs`.
 */
export function generateCustomNodeModule(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
): string {
  const parts = generateCustomNodeParts(node, templateSource, ctx, 'workflow')
  const varName = ctx.varName(node.id)

  const paramsEntries = customParamsEntries(node)
  const referenced = ctx
    .upstreamVars(node.id)
    .filter((upstreamVar) => new RegExp(`\\b${upstreamVar}\\b`).test(paramsEntries))

  const importBlock = parts.imports.length > 0 ? parts.imports.join('\n') + '\n\n' : ''
  const destructure =
    referenced.length > 0 ? `  const { ${referenced.join(', ')} } = inputs;\n` : ''
  // Comment context, not string context: neutralize `*/` so a node name can
  // never terminate the JSDoc block and leak tokens into module scope.
  const commentName = node.name.replace(/\*\//g, '*\\/')
  const moduleSource = `${importBlock}${parts.classDefinition}

/** Step "${commentName}" — generated from the workflow node. */
export default async function ${varName}_step({ env, event, inputs, step, ctx }) {
${destructure}  return ${parts.className}.execute(env, {
${paramsEntries}
  });
}
`
  ctx.addFile({ path: `nodes/${varName}.ts`, source: moduleSource, role: 'module' })

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(extractTemplateBody(templateSource))
  const prefix = hasReturn ? `const ${varName} = ` : ''
  const inputsArg = referenced.length > 0 ? `{ ${referenced.join(', ')} }` : '{}'
  return `${prefix}await flow.step("${stepLabel(node)}"${configArg}, (ctx) => $${varName}({ env, event, inputs: ${inputsArg}, step, ctx }));`
}

function customParamsEntries(node: WorkflowNode): string {
  const configData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.data)) {
    const paramKey = key.startsWith('input_') ? key.slice(6) : key
    configData[paramKey] = value
  }
  return Object.entries(configData)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${toJsLiteral(value)},`)
    .join('\n')
}

export function generateCustomNodeParts(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
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
  const paramsEntries = customParamsEntries(node)

  const classDefinition = `class ${className} {
  static async execute(env: Env, params: Record<string, unknown>) {
${indent(body, 4)}
  }
}`

  const config = generateStepConfig(node.config)
  const configArg = config ? `, ${config}` : ''
  const hasReturn = /\breturn\b/.test(body)
  const prefix = hasReturn ? `const ${ctx.varName(node.id)} = ` : ''

  // Generated bodies always run with `env` in scope: the entry's `run`
  // aliases `flow.env`, and a script's fetch handler receives it.
  const envRef = 'env'

  const stepCode =
    mode === 'script'
      ? `${prefix}await ${className}.execute(${envRef}, {
${paramsEntries}
});`
      : `${prefix}await flow.step("${stepLabel(node)}"${configArg}, async () => {
  return ${className}.execute(${envRef}, {
${paramsEntries}
  });
});`

  return { classDefinition, stepCode, imports, className }
}
