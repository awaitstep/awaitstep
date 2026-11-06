import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { resolveExpressions, scanExpressions } from '@awaitstep/ir'
import type { GenerateMode, TemplateResolver, StepKind } from '@awaitstep/codegen'
import type { GenerationContext, GeneratorLookup } from '@awaitstep/codegen'
import { GenerateInputError, inlineGenerationContext, withoutComments } from '@awaitstep/codegen'
import {
  generateCustomNode,
  generateCustomNodeModule,
  generateCustomNodeParts,
} from './generators/custom.js'
import { CONTAINER_TYPES } from './generators/branch.js'
import { builtinGenerators } from './generator-registry.js'
import type { BindingType } from './bindings.js'
export { extractImports } from './imports.js'

/**
 * Collects env-var names referenced through `{{env.NAME}}` expressions in
 * node data, for the generated `interface Env`. Parser-based so the v2
 * grammar's fallback form (`{{env.NAME ?? "default"}}`) and quoted keys
 * (`{{env["api-key"]}}`) are seen too — every ref the compiler resolves gets
 * a declared Env field (quoted at the emission site when not an identifier).
 */
export function collectEnvRefNames(nodes: WorkflowNode[]): Set<string> {
  const names = new Set<string>()
  for (const node of nodes) {
    for (const value of Object.values(node.data)) {
      if (typeof value !== 'string') continue
      for (const span of scanExpressions(value)) {
        if (span.ast.ref !== 'env') continue
        const first = span.ast.segments[0]
        const name =
          first?.kind === 'prop' ? first.name : first?.kind === 'key' ? first.value : null
        if (name) names.add(name)
      }
    }
  }
  return names
}

const JS_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Interface-field form of an env-var name, quoted when not a valid identifier. */
export function envFieldName(name: string): string {
  return JS_IDENTIFIER_PATTERN.test(name) ? name : JSON.stringify(name)
}

/**
 * Cloudflare Worker `Env` interface field type for each detected binding kind.
 * `secret` and `variable` are intentionally `null` — they're emitted as
 * `string` fields alongside other string env vars, not as typed bindings.
 */
export const CF_ENV_TYPE: Record<BindingType, string | null> = {
  kv: 'KVNamespace',
  d1: 'D1Database',
  r2: 'R2Bucket',
  queue: 'Queue<unknown>',
  service: 'Fetcher',
  ai: 'Ai',
  vectorize: 'VectorizeIndex',
  analytics_engine: 'AnalyticsEngineDataset',
  hyperdrive: 'Hyperdrive',
  browser: 'Fetcher',
  secret: null,
  variable: null,
}

/**
 * Collapses runs of blank/whitespace-only lines in source so the generated
 * worker doesn't carry the empty whitespace left behind by the annotation
 * parser when it strips `@kind function NAME(...) { ... }` blocks (the
 * stripper replaces those spans with spaces to preserve line numbers).
 */
export function collapseBlankLines(source: string): string {
  return source.replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
}

/**
 * Returns true if the body's last non-empty line is a `return` statement
 * (with or without value, with or without trailing semicolon). Used to
 * suppress redundant trailing returns appended by the codegen when the user's
 * code already exits explicitly.
 *
 * Heuristic: walks the body backwards to find the last non-blank line, strips
 * trailing semicolons, and matches `^return\b`. Doesn't reason about nested
 * blocks (an `if (x) { return }` with no else is correctly NOT detected as
 * always-returning, so the safety-net trailing return remains).
 */
export function endsWithReturn(body: string): boolean {
  const lines = body.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim()
    if (line === '') continue
    const stripped = line.replace(/;+\s*$/, '').trim()
    return /^return\b/.test(stripped)
  }
  return false
}

/**
 * Dispatches per-node code generation to the appropriate generator. Custom
 * node templates are looked up via `templateResolver` and (when
 * `classDefinitions` is provided) hoisted to module top level.
 */
export function generateNodeCode(
  node: WorkflowNode,
  ir: WorkflowIR,
  ctx: GenerationContext,
  templateResolver?: TemplateResolver,
  classDefinitions?: Map<string, string>,
  mode: GenerateMode = 'workflow',
  generators: GeneratorLookup = builtinGenerators,
): string {
  // Container children always inline (see inlineGenerationContext): their
  // code depends on container-scope bindings and text post-processing.
  const childCtx = CONTAINER_TYPES.has(node.type) ? inlineGenerationContext(ctx) : ctx
  const recurse = (n: WorkflowNode, ir2: WorkflowIR) =>
    generateNodeCode(n, ir2, childCtx, templateResolver, classDefinitions, mode, generators)

  const builtin = generators.get(node.type)
  if (builtin) {
    return builtin.generate({ node, ir, ctx, mode, recurse })
  }

  if (templateResolver) {
    const template = templateResolver.getTemplate(node.type, node.provider)
    if (template) {
      // Scripts stay single-file; container children arrive with an inline
      // ctx, so only top-level workflow custom nodes become modules.
      if (ctx.emitModules && mode === 'workflow') {
        return generateCustomNodeModule(node, template, ctx)
      }
      if (classDefinitions) {
        const parts = generateCustomNodeParts(node, template, ctx, mode)
        if (!classDefinitions.has(parts.className)) {
          classDefinitions.set(parts.className, parts.classDefinition)
        }
        return parts.imports.join('\n') + '\n' + parts.stepCode
      }
      return generateCustomNode(node, template, ctx, mode)
    }
  }
  throw new GenerateInputError(
    `Codegen not yet implemented for node type: ${node.type}`,
    'provider',
  )
}

/**
 * Walks a node's `data` and replaces `{{ <expr> }}` template strings with
 * their resolved JS expressions, using the generation context's var names.
 * Run on a per-node copy when the IR contains template expressions.
 */
export function resolveNodeExpressions(
  node: WorkflowNode,
  varNameFor: (nodeId: string) => string,
): WorkflowNode {
  const resolve = (value: string) => resolveExpressions(value, varNameFor)
  const resolvedData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.data)) {
    if (typeof value === 'string') {
      resolvedData[key] = resolve(value)
    } else if (Array.isArray(value)) {
      resolvedData[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const resolved: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            resolved[k] = typeof v === 'string' ? resolve(v) : v
          }
          return resolved
        }
        return typeof item === 'string' ? resolve(item) : item
      })
    } else {
      resolvedData[key] = value
    }
  }
  return { ...node, data: resolvedData }
}

/**
 * Which durable primitive a node's emitted code carries its label on, read
 * from the text the generators produced: the manifest records a step name
 * only when a literal actually exists for run telemetry to match.
 */
export function detectKind(part: string, label: string): StepKind | undefined {
  if (part.includes(`flow.step("${label}"`)) return 'do'
  if (part.includes(`flow.sleep("${label}"`) || part.includes(`flow.sleepUntil("${label}"`)) {
    return 'sleep'
  }
  if (part.includes(`flow.waitForEvent("${label}"`)) return 'waitForEvent'
  return undefined
}

/**
 * The call a step module is invoked with, as `emitModuleFile` emits it. Only
 * this exact shape is rewritten below: an `inputs: { … }` inside a person's
 * own code — an inline step, a request body — is theirs.
 */
const MODULE_CALL = /\$([A-Za-z0-9_]+)\(\{ env, event, inputs: \{ ([^}]*) \}, step, ctx \}\)/g

/**
 * Drops from every generated step call's `inputs: { … }` the names nothing
 * binds in the body. A module asks for an upstream var when its code
 * mentions the word — which a string or a property name can do — but only
 * a var declared at the call site (`const X =`, a `let X`, or a name the
 * caller binds otherwise, `bound`) can be passed; an unbound one would be a
 * ReferenceError on every request. The module's own `const { X } = inputs`
 * then reads undefined, which is what a spurious match deserves. The
 * declaration scan ignores comments.
 */
export function pruneUndeclaredInputs(body: string, bound: Iterable<string> = []): string {
  const declared = new Set<string>(bound)
  const code = withoutComments(body)
  for (const match of code.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    declared.add(match[1]!)
  }
  for (const match of code.matchAll(
    /\blet\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)\s*;/g,
  )) {
    for (const name of match[1]!.split(',')) declared.add(name.trim())
  }
  return body.replace(MODULE_CALL, (_whole, moduleVar: string, list: string) => {
    const kept = list
      .split(',')
      .map((name) => name.trim())
      .filter((name) => declared.has(name))
    const inputs = kept.length > 0 ? `{ ${kept.join(', ')} }` : '{}'
    return `$${moduleVar}({ env, event, inputs: ${inputs}, step, ctx })`
  })
}

/** Columns a line of generated code may take once indented into its function. */
const LINE_WIDTH = 100

const MODULE_CALL_LINE =
  /^([ \t]*)((?:(?:const )?[A-Za-z0-9_]+ = )?await flow\.step\(.*?, \(ctx\) =>) (\$[A-Za-z0-9_]+\(\{ env, event, inputs: \{[^}]*\}, step, ctx \}\))\);$/gm
const LEAN_CALL_LINE =
  /^([ \t]*)(await flow\.step\(.*?, async \(ctx\) =>) \{ (await \$[A-Za-z0-9_]+\(\{ env, event, inputs: \{[^}]*\}, step, ctx \}\);) \}\);$/gm

/**
 * Wraps the module calls that outgrow the line, as a person would format
 * them: the call on its own line after the arrow, the `$var({ … })` call
 * itself kept whole. Runs on the finished body, once a dropped `const`
 * prefix or a hoist has settled the line's final shape; `indentWidth` is the
 * indentation the body receives when it is placed in its function.
 */
export function wrapModuleCalls(body: string, indentWidth: number): string {
  const fits = (line: string) => line.length + indentWidth <= LINE_WIDTH
  return body
    .replace(MODULE_CALL_LINE, (line, indent: string, head: string, call: string) =>
      fits(line) ? line : `${indent}${head}\n${indent}  ${call},\n${indent});`,
    )
    .replace(LEAN_CALL_LINE, (line, indent: string, head: string, statement: string) =>
      fits(line) ? line : `${indent}${head} {\n${indent}  ${statement}\n${indent}});`,
    )
}
