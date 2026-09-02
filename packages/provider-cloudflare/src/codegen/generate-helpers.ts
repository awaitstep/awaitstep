import type { WorkflowIR, WorkflowNode } from '@awaitstep/ir'
import { resolveExpressions, scanExpressions } from '@awaitstep/ir'
import type { GenerateMode, TemplateResolver } from '@awaitstep/codegen'
import type { GenerationContext, GeneratorLookup } from '@awaitstep/codegen'
import { inlineGenerationContext } from '@awaitstep/codegen'
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
  throw new Error(`Codegen not yet implemented for node type: ${node.type}`)
}

/**
 * Walks a node's `data` and replaces `{{ <expr> }}` template strings with
 * their resolved JS expressions, using the generation context's var names.
 * Run on a per-node copy when the IR contains template expressions.
 */
export function resolveNodeExpressions(node: WorkflowNode, ctx: GenerationContext): WorkflowNode {
  const resolve = (value: string) => resolveExpressions(value, (id) => ctx.varName(id))
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
