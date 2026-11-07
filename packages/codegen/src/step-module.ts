import type { ValidationError, WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { extractImports } from './imports.js'
import { computeVarNames } from './context.js'
import { containerArms, upstreamScopeOf } from './dag.js'
import { blockBindingsOf } from './block-bindings.js'
import { AUTO_EXPORT_TYPES, isExportedNode } from './sanitize.js'
import { indent } from './format.js'
import {
  defaultFunctionHeader,
  identifierWords,
  maskNonCode,
  matchingBracket,
  skipWhitespace,
} from './code-text.js'

/** What a step module's function receives, in the order the worker passes it. */
export const STEP_MODULE_PARAMS = ['env', 'event', 'inputs', 'step', 'ctx'] as const
export const STEP_MODULE_SIGNATURE = '{ env, event, inputs, step, ctx }'
/** The most characters one step's code may hold: a module is read on every save, load and generation. */
export const MAX_STEP_CODE_LENGTH = 250_000

const EXPORT_DEFAULT_RE = /\bexport\s+default\b/
const RETURN_RE = /\breturn\b/
const DECLARATION_RE = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
const PARAMS = new Set<string>(STEP_MODULE_PARAMS)
const SIGNATURE_COMPACT = STEP_MODULE_SIGNATURE.replace(/\s+/g, '')

/** A step's code in module form: it has a default export. A body (statements) has none. Strings and comments do not count. */
export function isStepModule(code: string): boolean {
  return EXPORT_DEFAULT_RE.test(maskNonCode(code))
}

/**
 * The name of the default-exported function declaration; null when the
 * default export is anonymous, an expression, or absent.
 */
export function stepFunctionName(code: string): string | null {
  return defaultFunctionHeader(maskNonCode(code))?.name ?? null
}

/**
 * Whether a step's code returns a value — the one test the emitters, the
 * export plan and the canvas share. A `return` in a comment or a string is
 * not one.
 */
export function stepReturnsValue(code: string): boolean {
  return RETURN_RE.test(maskNonCode(code))
}

/** A fresh step's code: the module shape with the documented default body. */
export function stepModuleTemplate(
  varName: string,
  body = '// Write your business logic here\n\nreturn { result: "ok" };',
): string {
  return `export default async function ${varName}(${STEP_MODULE_SIGNATURE}) {\n${indent(body, 2)}\n}\n`
}

/** The names a piece of (masked) code declares with const/let/var/function/class. */
function declaredNames(masked: string): Set<string> {
  const names = new Set<string>()
  for (const match of masked.matchAll(DECLARATION_RE)) names.add(match[1]!)
  return names
}

/**
 * A body (statements) as the module the worker imports: imports on top, the
 * function named after the step, and — because a body read earlier steps and
 * its container's bindings by bare name — a destructure of what it mentions
 * as a whole word and does not declare itself. `bindings` is the enclosing
 * container's `inputs` key → the name the inline form bound (`item`,
 * `index: _loop_i`, `error: err`); it wins over an upstream step of the same
 * name, as the nearer scope did. A body that declares one of the module's own
 * parameter names runs nested, so the declaration cannot clash with it. Code
 * already in module form is returned as it is.
 */
export function normalizeStepModule(
  code: string,
  varName: string,
  upstreamNames: Iterable<string>,
  bindings: Readonly<Record<string, string>> = {},
): string {
  if (isStepModule(code)) return code
  const { imports, body } = extractImports(code)
  const masked = maskNonCode(body)
  const words = identifierWords(masked)
  const declared = declaredNames(masked)
  const reads = (name: string): boolean => words.has(name) && !declared.has(name)
  const entries: string[] = []
  const taken = new Set<string>()
  for (const [key, lexical] of Object.entries(bindings)) {
    taken.add(key)
    taken.add(lexical)
    if (reads(lexical)) entries.push(key === lexical ? key : `${key}: ${lexical}`)
  }
  for (const name of upstreamNames) {
    if (!taken.has(name) && reads(name)) entries.push(name)
  }
  const destructure = entries.length > 0 ? `const { ${entries.join(', ')} } = inputs;\n` : ''
  const nests = [...declared].some((name) => PARAMS.has(name))
  const statements = nests
    ? `return await (async () => {\n${indent(body.trim(), 2)}\n})();`
    : body.trim()
  const importBlock = imports.length > 0 ? imports.join('\n') + '\n\n' : ''
  return `${importBlock}export default async function ${varName}(${STEP_MODULE_SIGNATURE}) {\n${indent(destructure + statements, 2)}\n}\n`
}

/**
 * Every non-inline step's code in module form, so one shape reaches the
 * emitters, the editor and the save path alike. A body is normalised with
 * the other nodes' variable names as its possible upstream reads and its
 * containers' bindings; a document whose steps are all modules already is
 * returned as it is, without reading the graph.
 */
export function normalizeStepModules<
  T extends {
    nodes: WorkflowNode[]
    edges?: WorkflowIR['edges']
    entryNodeId?: string
    kind?: string
  },
>(ir: T): T {
  const bodies = new Set(
    ir.nodes
      .filter(
        (node) =>
          node.type === 'step' &&
          node.data.inline !== true &&
          !isStepModule(String(node.data.code ?? '')),
      )
      .map((node) => node.id),
  )
  if (bodies.size === 0) return ir
  const names = computeVarNames(ir.nodes)
  const upstream = upstreamOrEveryone(ir, names)
  const bindings = bindingsOrNone(ir)
  const nodes = ir.nodes.map((node) => {
    if (!bodies.has(node.id)) return node
    const code = normalizeStepModule(
      String(node.data.code ?? ''),
      names.get(node.id)!,
      upstream(node.id),
      bindings(node.id),
    )
    return { ...node, data: { ...node.data, code } }
  })
  return { ...ir, nodes }
}

/**
 * The names a body may have read bare: what the emitter binds at its call
 * site — the block-aware upstream, with a function's returned children
 * hoisted — or, for a graph the sort refuses, every other node's name. The
 * index is built once; each node's list only when asked for.
 */
function upstreamOrEveryone(
  ir: { nodes: WorkflowNode[]; edges?: WorkflowIR['edges']; entryNodeId?: string; kind?: string },
  names: Map<string, string>,
): (nodeId: string) => string[] {
  if (ir.edges && ir.entryNodeId) {
    try {
      const hoisted =
        ir.kind === 'script'
          ? (node: WorkflowNode) => isExportedNode(node) || AUTO_EXPORT_TYPES.has(node.type)
          : () => false
      return upstreamScopeOf(ir as WorkflowIR, names, hoisted)
    } catch {
      // A cycle: fall through to the widest reading.
    }
  }
  return (nodeId) =>
    ir.nodes.filter((other) => other.id !== nodeId).map((other) => names.get(other.id)!)
}

/** The container bindings around each node, or none when the graph cannot be read as blocks. */
function bindingsOrNone(ir: {
  nodes: WorkflowNode[]
  edges?: WorkflowIR['edges']
  entryNodeId?: string
}): (nodeId: string) => Record<string, string> {
  if (ir.edges && ir.entryNodeId) {
    try {
      return blockBindingsOf(
        ir as Pick<WorkflowIR, 'nodes' | 'edges'>,
        containerArms(ir as WorkflowIR),
      )
    } catch {
      // A malformed graph: no container binds anything a body could have read.
    }
  }
  return () => ({})
}

/**
 * Renames the default-exported function when it is still called `from`;
 * anything else is left alone. The name is found in the code, never in a
 * comment or a string.
 */
export function renameStepFunction(code: string, from: string, to: string): string {
  if (from === to) return code
  const header = defaultFunctionHeader(maskNonCode(code))
  if (!header || header.name !== from) return code
  return code.slice(0, header.nameStart) + to + code.slice(header.nameEnd)
}

/**
 * The step functions renamed to follow their variable names after the graph
 * changed shape — a node removed, renamed, duplicated or pasted moves the
 * `_2` suffixes of others. A step that was there keeps a function named
 * something other than its old variable (the person's own mismatch, reported
 * as such); a step that is new (a clone exports its source's name) is named
 * after its variable outright. Returns `next` itself when nothing changes.
 */
export function followStepFunctionNames(
  previous: readonly WorkflowNode[],
  next: readonly WorkflowNode[],
): readonly WorkflowNode[] {
  const before = computeVarNames([...previous])
  const after = computeVarNames([...next])
  let changed = false
  const nodes = next.map((node) => {
    if (node.type !== 'step' || node.data.inline === true) return node
    const varName = after.get(node.id)!
    const code = String(node.data.code ?? '')
    const current = stepFunctionName(code)
    if (current === null || current === varName) return node
    const old = before.get(node.id)
    if (old !== undefined && current !== old) return node
    changed = true
    return { ...node, data: { ...node.data, code: renameStepFunction(code, current, varName) } }
  })
  return changed ? nodes : next
}

const INPUTS_DESTRUCTURE_LINE_RE = /^[ \t]*const\s*\{([^{}]*)\}\s*=\s*inputs;?[ \t]*\n?/
const NESTED_BODY_RE = /^return await \(async \(\) => \{\n([\s\S]*)\n\}\)\(\);$/
const INPUTS_MEMBER_RE = /\binputs\s*\??\.\s*([A-Za-z_$][\w$]*)/g

/**
 * The statements of a module in the shape {@link normalizeStepModule}
 * writes, as an inline step's body: the function unwrapped (and un-nested),
 * the `inputs` destructure dropped — its names are in scope as bare
 * variables there — and `inputs.<key>` reads turned into the bare names the
 * surrounding block binds (`bindings`, key → name). Code in any other shape —
 * another signature, a helper beside the function, a destructure that
 * renames — is returned unchanged; the step then reports that an inline step
 * holds statements.
 */
export function stepBodyFromModule(
  code: string,
  bindings: Readonly<Record<string, string>> = {},
): string {
  const { imports, body: rest } = extractImports(code)
  const masked = maskNonCode(rest)
  const header = defaultFunctionHeader(masked)
  if (!header || header.name === null || masked.slice(0, header.start).trim() !== '') return code
  const paramsClose = matchingBracket(masked, header.paramsOpen, '(', ')')
  if (paramsClose === -1) return code
  if (masked.slice(header.paramsOpen + 1, paramsClose).replace(/\s+/g, '') !== SIGNATURE_COMPACT) {
    return code
  }
  const open = skipWhitespace(masked, paramsClose + 1)
  if (masked[open] !== '{') return code
  const close = matchingBracket(masked, open, '{', '}')
  if (close === -1 || masked.slice(close + 1).trim() !== '') return code

  let body = dedent(rest.slice(open + 1, close).replace(/^\n/, ''))
  const destructure = INPUTS_DESTRUCTURE_LINE_RE.exec(body)
  if (destructure) {
    for (const part of destructure[1]!.split(',')) {
      const entry = part.trim()
      if (entry === '') continue
      const [key, alias] = entry.split(':').map((piece) => piece.trim())
      // A default or a rename the inline scope has no name for: not ours to unwrap.
      if (!key || key.includes('=') || (alias !== undefined && bindings[key] !== alias)) return code
    }
    body = body.slice(destructure[0].length)
  }
  const nested = NESTED_BODY_RE.exec(body.trim())
  if (nested) body = dedent(nested[1]!)
  body = body.replace(INPUTS_MEMBER_RE, (_, key: string) => bindings[key] ?? key)
  return (imports.length > 0 ? imports.join('\n') + '\n\n' : '') + body.trim() + '\n'
}

function dedent(text: string): string {
  const lines = text.split('\n')
  const widths = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)![0].length)
  const width = widths.length > 0 ? Math.min(...widths) : 0
  return lines.map((line) => line.slice(Math.min(width, line.length))).join('\n')
}

/**
 * What stops this step from saving, in the step's own words, or null: code
 * longer than {@link MAX_STEP_CODE_LENGTH}, a module whose default function
 * is not named `expectedName` (the name the worker imports it by), or an
 * inline step holding a module instead of statements.
 */
export function stepModuleProblem(
  node: Pick<WorkflowNode, 'type' | 'data'>,
  expectedName: string,
): string | null {
  if (node.type !== 'step') return null
  const code = String(node.data.code ?? '')
  if (code.length > MAX_STEP_CODE_LENGTH) {
    return `Step code is longer than ${MAX_STEP_CODE_LENGTH.toLocaleString('en-US')} characters.`
  }
  if (node.data.inline === true) {
    return isStepModule(code) ? 'Inline steps hold statements, not a module.' : null
  }
  const actual = stepFunctionName(code)
  if (actual === expectedName) return null
  return `The function must be named \`${expectedName}\`, the step’s name as code reads it${actual ? ` (it is \`${actual}\`)` : ''}.`
}

/** `stepModuleProblem` over a graph, as validation errors with the node's id. */
export function stepModuleProblems(ir: { nodes: WorkflowNode[] }): ValidationError[] {
  const names = computeVarNames(ir.nodes)
  const problems: ValidationError[] = []
  for (const node of ir.nodes) {
    const message = stepModuleProblem(node, names.get(node.id)!)
    if (message) problems.push({ path: `nodes.${node.id}.data.code`, nodeId: node.id, message })
  }
  return problems
}
