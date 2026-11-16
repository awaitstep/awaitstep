import { CUSTOM_NODE_RESERVED_FIELDS, compileExpression, scanExpressions } from '@awaitstep/ir'
import type { RuntimeHints, StepConfig, WorkflowNode } from '@awaitstep/ir'
import {
  GenerateInputError,
  stepLabel,
  sanitizeIdentifier,
  indent,
  type GenerateMode,
  type GenerationContext,
} from '../internal.js'
import { withoutComments } from '../../requirements.js'
import { generateStepConfig } from './config.js'
import { DEFAULT_STEP_CONFIG } from './step.js'

const TEMPLATE_HEAD = /export\s+default\s+async\s+function\b/

/**
 * Where the template function's body starts: just past its `{`. The head
 * is found once and walked by hand (no backtracking over user text), so a
 * template of repeated near-heads costs linear time. A return type may sit
 * between the parameters and the body (`: Promise<Output>`, as a custom
 * node's typed template has it); braces inside its `<…>` are part of it.
 */
function templateBodyStart(source: string): number | null {
  const head = TEMPLATE_HEAD.exec(source)
  if (!head) return null
  const open = source.indexOf('(', head.index + head[0].length)
  if (open === -1 || !/^[\s\w$]*$/.test(source.slice(head.index + head[0].length, open)))
    return null
  const close = source.indexOf(')', open)
  if (close === -1) return null
  let i = close + 1
  while (i < source.length && /\s/.test(source[i]!)) i++
  if (source[i] === ':') {
    let angle = 0
    for (i++; i < source.length; i++) {
      const ch = source[i]
      if (ch === '<') angle++
      else if (ch === '>' && angle > 0) angle--
      else if (ch === '{' && angle === 0) break
    }
  }
  return source[i] === '{' ? i + 1 : null
}

interface TemplateFunctionSpan {
  /** Where `export default async function` starts. */
  head: number
  /** Just past the body's `{`. */
  bodyStart: number
  /** The body's closing `}`. */
  bodyEnd: number
}

function templateFunctionSpan(source: string): TemplateFunctionSpan {
  const startIndex = templateBodyStart(source)
  if (startIndex === null) {
    throw new GenerateInputError(
      'Template must contain an `export default async function`',
      'provider',
    )
  }

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

  return { head: TEMPLATE_HEAD.exec(source)!.index, bodyStart: startIndex, bodyEnd: i - 1 }
}

export function extractTemplateBody(source: string): string {
  const span = templateFunctionSpan(source)
  return source.slice(span.bodyStart, span.bodyEnd).trim()
}

/**
 * The template's own top-level code around its function: constants, helpers
 * and types declared above or below `export default async function`, with
 * its import statements left out (they are hoisted on their own).
 */
function templateTopLevel(source: string): { before: string; after: string } {
  const span = templateFunctionSpan(source)
  return {
    before: withoutImportStatements(source.slice(0, span.head)).trim(),
    after: source.slice(span.bodyEnd + 1).trim(),
  }
}

const ENV_REF_BRACED = /^\{\{env\.([A-Z][A-Z0-9_]*)\}\}$/
const ENV_REF_BARE = /^env\.([A-Z][A-Z0-9_]*)$/

/**
 * A template node's field that holds an expression, already compiled to
 * JavaScript: written out as code, never quoted. A whole-value
 * `{{node.path}}` is the value itself (an object stays an object); text
 * around expressions is a template string.
 */
export class FieldExpression {
  constructor(readonly code: string) {}
  /** What the consumption scan reads: the identifiers the code names. */
  toJSON(): string {
    return this.code
  }
}

const TEMPLATE_TEXT_ESCAPES = /[\\`]|\$\{/g

/** A field's string with `{{…}}` spans as code: the value for one whole span, else a template string. */
export function compileFieldExpressions(
  value: string,
  refFor: (ref: string) => string,
): string | FieldExpression {
  const spans = scanExpressions(value)
  if (spans.length === 0) return value
  if (spans.length === 1 && value.trim() === spans[0]!.raw) {
    return new FieldExpression(compileExpression(spans[0]!.ast, refFor))
  }
  let out = '`'
  let cursor = 0
  for (const span of spans) {
    out += value.slice(cursor, span.start).replace(TEMPLATE_TEXT_ESCAPES, (m) => `\\${m}`)
    out += `\${${compileExpression(span.ast, refFor)}}`
    cursor = span.end
  }
  out += value.slice(cursor).replace(TEMPLATE_TEXT_ESCAPES, (m) => `\\${m}`) + '`'
  return new FieldExpression(out)
}

export function toJsLiteral(value: unknown): string {
  if (value instanceof FieldExpression) return value.code
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') {
    const envMatch = value.match(ENV_REF_BRACED) ?? value.match(ENV_REF_BARE)
    if (envMatch) return `env.${envMatch[1]}`
    if (/\$\{.*?\}/.test(value)) {
      return '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'
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

/** The source without its import statements, read line by line as `extractImportLines` reads them. */
function withoutImportStatements(source: string): string {
  const kept: string[] = []
  let inImport = false
  for (const line of source.split('\n')) {
    if (inImport) {
      if (/from\s*['"]/.test(line)) inImport = false
      continue
    }
    if (/^\s*import\s*['"]/.test(line)) continue
    if (/^\s*import[\s{]/.test(line)) {
      inImport = !/from\s*['"]/.test(line)
      continue
    }
    kept.push(line)
  }
  return kept.join('\n')
}

function extractImportLines(source: string): string[] {
  const lines = source.split('\n')
  const imports: string[] = []
  let pending: string[] | null = null

  for (const line of lines) {
    if (pending) {
      pending.push(line)
      if (/from\s*['"]/.test(line)) {
        imports.push(pending.join('\n').trim())
        pending = null
      }
    } else if (/^\s*import\s*['"]/.test(line)) {
      // A bare side-effect import is a whole statement on its own.
      imports.push(line.trim())
    } else if (/^\s*import[\s{]/.test(line)) {
      if (/from\s*['"]/.test(line)) {
        imports.push(line.trim())
      } else {
        pending = [line]
      }
    }
  }

  return imports
}

// `import` is a reserved word, so after `;` or `}` it starts a statement unless it is `import(` or `import.meta`.
const ONE_PER_LINE = 'write one import per line'
const MID_LINE_IMPORT = /[;}][ \t]*import\b(?![ \t]*[.(])[^\n;]{0,60}/
// `import(…)`, its specifier when it is a plain string; `import.meta` is not a call.
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?:(['"])([^'"\n]*)\1)?/g
const IMPORT_SPECIFIER = /(?:\bfrom\s*|^import\s*)(['"])([^'"]+)\1/
// After the specifier: an import attribute block, a semicolon, nothing else.
const STATEMENT_END = /^\s*(?:(?:with|assert)\s*\{[^{}]*\})?\s*;?\s*$/

/** `import type …`, or braces whose every member is `type X`: erased by the compiler. */
function isTypeOnlyImport(statement: string): boolean {
  // `import type from './x'` is a value import of a binding named `type`.
  if (/^import\s+type\s+(?!from\s*['"])/.test(statement)) return true
  const braces = /^import\s*\{([^}]*)\}\s*from\b/.exec(statement)
  if (!braces) return false
  const members = braces[1]!
    .split(',')
    .map((member) => member.trim())
    .filter(Boolean)
  return members.length > 0 && members.every((member) => /^type\s/.test(member))
}

export interface TemplateImports {
  /** The statements hoisted into the generated module. */
  kept: string[]
  /** Why an import cannot be hoisted, one message each. */
  problems: string[]
}

/**
 * How a node template's imports are hoisted, read with comments skipped.
 * Type-only imports go (the compiler would erase them; a custom node's
 * `import type { Ctx, Output } from './ctx'` names a file that is never
 * bundled). A relative value import is refused: the template is hoisted
 * into a generated module, where `./x` names something else. The publish
 * check applies the same function, so what publishes also generates.
 */
export function templateImports(source: string): TemplateImports {
  const kept: string[] = []
  const problems = new Set<string>()
  const code = withoutComments(source)
  for (const call of code.matchAll(DYNAMIC_IMPORT)) {
    const specifier = call[2]
    if (specifier === undefined) {
      problems.add('"import(…)": name the package in quotes')
    } else if (/^[./]/.test(specifier)) {
      problems.add(
        `"${specifier}": a node template can import npm packages and #modules/ only; move shared code into a module`,
      )
    }
  }
  for (const statement of extractImportLines(code)) {
    if (isTypeOnlyImport(statement)) continue
    const match = IMPORT_SPECIFIER.exec(statement)
    // A line is hoisted whole, so anything after its one specifier would ride along unjudged.
    if (!match || !STATEMENT_END.test(statement.slice(match.index + match[0].length))) {
      problems.add(`"${statement.split('\n')[0]}": ${ONE_PER_LINE}`)
      continue
    }
    const specifier = match[2]!
    if (/^[./]/.test(specifier)) {
      problems.add(
        `"${specifier}": a node template can import npm packages and #modules/ only; move shared code into a module`,
      )
    } else kept.push(statement)
  }
  // Only line-start imports are hoisted; one after `;` or `}` would ride
  // along unjudged with the template's top-level code. An import line
  // carrying it is already reported above.
  const midLine = MID_LINE_IMPORT.exec(code)
  if (midLine && ![...problems].some((problem) => problem.endsWith(ONE_PER_LINE))) {
    problems.add(`"${midLine[0].trim()}": ${ONE_PER_LINE}`)
  }
  return { kept, problems: [...problems] }
}

function hoistableImports(source: string, node: WorkflowNode): string[] {
  const { kept, problems } = templateImports(source)
  if (problems.length > 0) {
    throw new GenerateInputError(`Node "${node.name}" imports ${problems[0]}`, 'library')
  }
  return kept
}

function toClassName(nodeType: string): string {
  const base = sanitizeIdentifier(nodeType)
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  return `${base}Node`
}

/** A parameter split into its binding and its default, its type annotation dropped. */
interface TemplateParameterParts {
  /** `ctx`, `{ config }`. Empty when the template takes no parameter. */
  binding: string
  /** The default's expression, `{}` of `= {}`, or null. */
  initializer: string | null
}

/** The first index at bracket depth 0 where `ch` stands, or -1. */
function topLevelIndex(text: string, target: string, from = 0): number {
  let depth = 0
  for (let i = from; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '{' || ch === '[' || ch === '(' || ch === '<') depth++
    else if (ch === '}' || ch === ']' || ch === ')' || ch === '>') depth--
    else if (depth === 0 && ch === target) return i
  }
  return -1
}

/** `{ config }: Ctx = {}` → binding `{ config }`, initializer `{}`. */
function splitParameter(param: string): TemplateParameterParts {
  const equals = topLevelIndex(param, '=')
  const head = equals === -1 ? param : param.slice(0, equals)
  const initializer = equals === -1 ? null : param.slice(equals + 1).trim() || null
  const colon = topLevelIndex(head, ':')
  return { binding: (colon === -1 ? head : head.slice(0, colon)).trim(), initializer }
}

function templateParameterParts(source: string): TemplateParameterParts {
  const none = { binding: '', initializer: null }
  const head = TEMPLATE_HEAD.exec(source)
  if (!head) return none
  const open = source.indexOf('(', head.index + head[0].length)
  if (open === -1) return none
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return splitParameter(source.slice(open + 1, i))
  }
  return none
}

/**
 * The template's own parameter list, without types: what its body calls
 * the context (`ctx`, `c`, `{ config, env }`), with its default when it
 * has one. Empty when it takes none.
 */
export function templateParameter(source: string): string {
  const { binding, initializer } = templateParameterParts(source)
  return initializer === null ? binding : `${binding} = ${initializer}`
}

/** The parameter as the module declares it: typed `any`, a default kept after the type. */
function typedTemplateParameter(source: string): string {
  const { binding, initializer } = templateParameterParts(source)
  if (!binding) return ''
  return initializer === null ? `${binding}: any` : `${binding}: any = ${initializer}`
}

/**
 * The retries and timeout a durable template node runs with: the
 * placement's own `node.config` when set, else the node's `node.json`
 * runtime hints (`defaultRetries`, `defaultTimeout`), else nothing, so the
 * runtime's default applies. Hinted retries use a step's own delay and
 * backoff, since a hint carries only the count.
 */
export function templateStepConfig(
  node: Pick<WorkflowNode, 'config'>,
  runtime: RuntimeHints | undefined,
): StepConfig | undefined {
  if (node.config) return node.config
  if (!runtime) return undefined
  const config: StepConfig = {}
  if (typeof runtime.defaultRetries === 'number') {
    config.retries = {
      limit: runtime.defaultRetries,
      delay: DEFAULT_STEP_CONFIG.retries!.delay,
      backoff: DEFAULT_STEP_CONFIG.retries!.backoff,
    }
  }
  if (runtime.defaultTimeout) config.timeout = runtime.defaultTimeout
  return config.retries || config.timeout !== undefined ? config : undefined
}

/** A template node placed with "Inline — no step": a plain call, no step boundary. */
export function isInlineTemplateNode(node: Pick<WorkflowNode, 'data'>): boolean {
  return node.data.inline === true
}

/** The placement's own keys: how it runs and whether it is returned, never a field passed to the template. */
const PLACEMENT_KEYS: ReadonlySet<string> = new Set(CUSTOM_NODE_RESERVED_FIELDS)

export interface CustomNodeOutput {
  classDefinition: string
  stepCode: string
  imports: string[]
  className: string
}

export interface CustomNodeOptions {
  /** The node's `node.json` runtime hints: its default retries and timeout. */
  runtime?: RuntimeHints
}

export function generateCustomNode(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
  options: CustomNodeOptions = {},
): string {
  const result = generateCustomNodeParts(node, templateSource, ctx, mode, options)
  const parts: string[] = []
  if (result.imports.length > 0) parts.push(result.imports.join('\n'))
  parts.push(result.classDefinition)
  parts.push(result.stepCode)
  return parts.join('\n')
}

/**
 * The names the module's own locals take. `sanitizeIdentifier` never leaves
 * a `$` in a node's variable name, so an earlier node read through `inputs`
 * can never collide with them.
 */
const TEMPLATE_FUNCTION = '$runTemplate'
const FIELDS = '$fields'

/**
 * The template node as its own module, `nodes/<var>.ts`, in workflows and
 * functions alike, inside containers too. The module holds the template
 * exactly as written (its imports, its own top-level code, and its function
 * as `$runTemplate`) and
 * a default export that builds the context it declares,
 * `{ env, config, inputs }`, from the node's fields. Nothing in the
 * template is rewritten, so a template that logs, destructures or passes on
 * its context, or has a variable of its own called `params`, runs as its
 * author wrote it.
 *
 * The entry only imports and calls the module with `{ env }` (and `inputs`
 * when a field reads an earlier value), so a
 * long template never lands in `workflow.ts` or `function.ts`. Upstream
 * values and the enclosing container's bindings (`item`, `index`, `error`)
 * that the fields read arrive through `inputs`.
 *
 * Durable (the default) calls it inside `flow.step` with the node's retries
 * and timeout; Inline calls it directly, with no step.
 */
export function generateCustomNodeModule(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
  _mode: GenerateMode = 'workflow',
  options: CustomNodeOptions = {},
): string {
  const imports = hoistableImports(templateSource, node)
  const topLevel = templateTopLevel(templateSource)
  const declared = [...imports, topLevel.before, topLevel.after].join('\n')
  for (const local of [TEMPLATE_FUNCTION, FIELDS]) {
    if (declared.includes(local)) {
      throw new GenerateInputError(
        `Node "${node.name}" declares "${local}", which its module uses; rename it`,
        'library',
      )
    }
  }
  const body = extractTemplateBody(templateSource)
  const parameter = typedTemplateParameter(templateSource)
  const varName = ctx.varName(node.id)

  const fieldEntries = customParamsEntries(node)
  const reads = (name: string) => new RegExp(`\\b${name}\\b`).test(fieldEntries)
  const entries = new Map<string, string>()
  for (const name of ctx.upstreamVars(node.id)) if (reads(name)) entries.set(name, name)
  // `{{event.payload…}}` in a field: the call site has `event`, the module does not.
  if (reads('event')) entries.set('event', 'event')
  // The container's bindings win over an upstream value of the same name,
  // as the nearer scope does for a step module.
  for (const [key, expression] of Object.entries(ctx.blockInputs ?? {})) {
    if (reads(key)) entries.set(key, expression)
  }
  const referenced = [...entries.keys()]

  const importBlock = imports.length > 0 ? imports.join('\n') + '\n\n' : ''
  const destructure =
    referenced.length > 0 ? `  const { ${referenced.join(', ')} } = inputs;\n` : ''
  // Comment context, not string context: neutralize `*/` so a node name can
  // never terminate a comment block and leak tokens into module scope.
  const commentName = node.name.replace(/\*\//g, '*\\/')
  const call = parameter
    ? `${TEMPLATE_FUNCTION}({ env, config: ${FIELDS}, inputs: ${FIELDS} })`
    : `${TEMPLATE_FUNCTION}()`
  // `env` carries bindings as well as strings, and `Env` lives in the
  // entry's own file, which differs by generator: the module stays self-contained.
  // `inputs` is taken only when a field reads an earlier value or a binding.
  const signature =
    referenced.length > 0
      ? '{\n  env,\n  inputs = {},\n}: {\n  env: Record<string, any>\n  inputs?: Record<string, any>\n}'
      : '{ env }: { env: Record<string, any> }'
  const before = topLevel.before ? `${topLevel.before}\n\n` : ''
  const after = topLevel.after ? `\n${topLevel.after}\n` : ''
  const moduleSource = `${importBlock}${before}/** The template of "${commentName}", as written. */
async function ${TEMPLATE_FUNCTION}(${parameter}) {
${indent(body, 2)}
}
${after}
/** Node "${commentName}": its fields, handed to its template. */
export default async function ${varName}_step(${signature}) {
${destructure}  const ${FIELDS}: Record<string, unknown> = {
${fieldEntries}
  };
  return ${call};
}
`
  const path = `nodes/${varName}.ts`
  if (!ctx.files.some((file) => file.path === path)) {
    ctx.addFile({ path, source: moduleSource, role: 'module' })
  }

  const hasReturn = /\breturn\b/.test(body)
  const prefix = hasReturn ? `const ${varName} = ` : ''
  const invoke =
    entries.size > 0
      ? `$${varName}({ env, inputs: { ${[...entries].map(([key, expr]) => (key === expr ? key : `${key}: ${expr}`)).join(', ')} } })`
      : `$${varName}({ env })`
  if (isInlineTemplateNode(node)) return `${prefix}await ${invoke};`
  const config = generateStepConfig(templateStepConfig(node, options.runtime))
  const configArg = config ? `, ${config}` : ''
  return `${prefix}await flow.step("${stepLabel(node)}"${configArg}, () => ${invoke});`
}

function customParamsEntries(node: WorkflowNode): string {
  const configData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.data)) {
    if (PLACEMENT_KEYS.has(key)) continue
    const paramKey = key.startsWith('input_') ? key.slice(6) : key
    configData[paramKey] = value
  }
  return Object.entries(configData)
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${toJsLiteral(value)},`)
    .join('\n')
}

/**
 * The template as a class whose `execute(env, params)` runs it: the shape
 * a generation without module files (`emitModules` off) pastes into its
 * entry. The template's body runs as written, inside a function taking its
 * own parameter, which receives `{ env, config: params, inputs: params }`.
 */
export function generateCustomNodeParts(
  node: WorkflowNode,
  templateSource: string,
  ctx: GenerationContext,
  mode: GenerateMode = 'workflow',
  options: CustomNodeOptions = {},
): CustomNodeOutput {
  const imports = hoistableImports(templateSource, node)
  const body = extractTemplateBody(templateSource)
  const className = toClassName(node.type)
  const parameter = templateParameter(templateSource)

  const paramsEntries = customParamsEntries(node)
  const run = parameter
    ? `return (async (${parameter}) => {
${indent(body, 2)}
})({ env, config: params, inputs: params });`
    : `return (async () => {
${indent(body, 2)}
})();`

  const classDefinition = `class ${className} {
  static async execute(env: Env, params: Record<string, unknown>) {
${indent(run, 4)}
  }
}`

  const hasReturn = /\breturn\b/.test(body)
  const prefix = hasReturn ? `const ${ctx.varName(node.id)} = ` : ''
  const call = `${className}.execute(env, {
${paramsEntries}
})`

  let stepCode: string
  if (mode === 'script' || isInlineTemplateNode(node)) {
    stepCode = `${prefix}await ${call};`
  } else {
    const config = generateStepConfig(templateStepConfig(node, options.runtime))
    const configArg = config ? `, ${config}` : ''
    stepCode = `${prefix}await flow.step("${stepLabel(node)}"${configArg}, async () => {
  return ${indent(call, 2).trimStart()};
});`
  }

  return { classDefinition, stepCode, imports, className }
}
