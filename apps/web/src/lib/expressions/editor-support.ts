import {
  parseExpressionContent,
  resolveExpressionType,
  scanExpressions,
  validateExpressionRefs,
  RESERVED_EXPRESSION_REFS,
  type ArtifactIR,
  type NodeDefinitionLookup,
  type OutputField,
  type WorkflowNode,
} from '@awaitstep/ir'
import { outputFieldToType } from '@awaitstep/codegen'

/** Expression refs share the parser's WORD charset — ids outside it (e.g.
 * hyphenated imports) exist but cannot be referenced. */
const REFERENCEABLE_ID = /^[A-Za-z0-9_]+$/

export interface ExpressionEditorContext {
  /** The node whose field is being edited (its own output is not in scope). */
  nodeId: string
  nodes: { id: string; name: string; type: string }[]
  upstream: ReadonlySet<string>
  resolveDefinition: NodeDefinitionLookup['get']
}

export interface RefSuggestion {
  kind: 'ref'
  insert: string
  label: string
  detail: string
  documentation?: string
}

export interface PathSuggestion {
  kind: 'path'
  insert: string
  label: string
  detail: string
  documentation?: string
}

export interface CompletionAnalysis {
  /** Offset in the full text where the inserted suggestion starts. */
  replaceStart: number
  suggestions: (RefSuggestion | PathSuggestion)[]
}

const RESERVED_DOCS: Record<string, string> = {
  event: 'The trigger event: payload, timestamp, instanceId.',
  env: 'Environment variables and bindings.',
  trigger: 'Alias for the trigger payload.',
}

function expressionIr(ctx: ExpressionEditorContext): ArtifactIR {
  return {
    metadata: { name: 'editor', version: 1, createdAt: '', updatedAt: '' },
    entryNodeId: ctx.nodes[0]?.id ?? '',
    nodes: ctx.nodes.map(
      (n) =>
        ({
          id: n.id,
          name: n.name,
          type: n.type,
          version: '1.0.0',
          provider: 'cloudflare',
          position: { x: 0, y: 0 },
          data: {},
        }) as WorkflowNode,
    ),
    edges: [],
  } as unknown as ArtifactIR
}

/** The open `{{` span the offset sits inside, or null when outside one. */
function openExpressionStart(text: string, offset: number): number | null {
  const before = text.slice(0, offset)
  const open = before.lastIndexOf('{{')
  if (open === -1) return null
  if (before.indexOf('}}', open + 2) !== -1) return null
  return open
}

/**
 * Completion candidates at an offset: node refs (plus the reserved runtime
 * refs) right after `{{`, and outputSchema properties after a `ref.` path
 * prefix — resolved through the same resolveExpressionType that powers
 * validation, so suggestions never disagree with squiggles.
 */
export function analyzeCompletion(
  text: string,
  offset: number,
  ctx: ExpressionEditorContext,
): CompletionAnalysis | null {
  const open = openExpressionStart(text, offset)
  if (open === null) return null
  const content = text.slice(open + 2, offset)

  const lastDot = content.lastIndexOf('.')
  if (lastDot === -1) {
    const suggestions: RefSuggestion[] = []
    for (const ref of RESERVED_EXPRESSION_REFS) {
      suggestions.push({
        kind: 'ref',
        insert: ref,
        label: ref,
        detail: 'runtime',
        documentation: RESERVED_DOCS[ref],
      })
    }
    for (const node of ctx.nodes) {
      if (node.id === ctx.nodeId) continue
      if (!ctx.upstream.has(node.id)) continue
      if (!REFERENCEABLE_ID.test(node.id)) continue
      suggestions.push({
        kind: 'ref',
        insert: node.id,
        label: node.id,
        detail: node.name,
        documentation: `${node.name} (${node.type})`,
      })
    }
    return { replaceStart: open + 2, suggestions }
  }

  const base = content.slice(0, lastDot)
  const ast = parseExpressionContent(base)
  if (!ast) return null
  const resolved = resolveExpressionType(ast, expressionIr(ctx), { get: ctx.resolveDefinition })
  if (!resolved || resolved.type !== 'object' || !resolved.properties) {
    // No schema (or a non-object) — nothing trustworthy to offer.
    return { replaceStart: open + 2 + lastDot + 1, suggestions: [] }
  }
  const suggestions: PathSuggestion[] = Object.entries(resolved.properties).map(
    ([name, field]) => ({
      kind: 'path',
      insert: name,
      label: name,
      detail: outputFieldToType(field).split('\n')[0]!,
      documentation: field.description,
    }),
  )
  return { replaceStart: open + 2 + lastDot + 1, suggestions }
}

export interface HoverInfo {
  start: number
  end: number
  title: string
  typeText?: string
  description?: string
}

/** Hover info for the `{{...}}` span containing the offset, if any. */
export function analyzeHover(
  text: string,
  offset: number,
  ctx: ExpressionEditorContext,
): HoverInfo | null {
  const span = scanExpressions(text).find((s) => offset >= s.start && offset <= s.end)
  if (!span) return null
  const pathText = span.ast.segments
    .map((s) =>
      s.kind === 'prop' ? `.${s.name}` : s.kind === 'key' ? `["${s.value}"]` : `[${s.value}]`,
    )
    .join('')

  if (RESERVED_EXPRESSION_REFS.has(span.ast.ref)) {
    return {
      start: span.start,
      end: span.end,
      title: `${span.ast.ref}${pathText}`,
      description: RESERVED_DOCS[span.ast.ref],
    }
  }
  const node = ctx.nodes.find((n) => n.id === span.ast.ref)
  if (!node) return null
  const resolved = resolveExpressionType(span.ast, expressionIr(ctx), {
    get: ctx.resolveDefinition,
  })
  return {
    start: span.start,
    end: span.end,
    title: `${node.name}${pathText}`,
    typeText: resolved ? outputFieldToType(resolved) : undefined,
    description: resolved?.description,
  }
}

export interface ExpressionIssue {
  start: number
  end: number
  message: string
}

/**
 * Span-anchored validation issues for inline markers: each `{{...}}` span is
 * re-checked through validateExpressionRefs (the single authority used by
 * workflow validation) so editor squiggles and the validation panel agree.
 */
export function analyzeIssues(text: string, ctx: ExpressionEditorContext): ExpressionIssue[] {
  const allIds = new Set(ctx.nodes.map((n) => n.id))
  const issues: ExpressionIssue[] = []
  for (const span of scanExpressions(text)) {
    const spanText = text.slice(span.start, span.end)
    for (const error of validateExpressionRefs(
      spanText,
      ctx.nodeId,
      ctx.upstream as Set<string>,
      allIds,
    )) {
      issues.push({ start: span.start, end: span.end, message: error.message })
    }
  }
  return issues
}

export interface BindingPath {
  /** Dotted path from the node ref, e.g. ".data.model". */
  path: string
  type: string
  description?: string
}

/**
 * Flattens an outputSchema into insertable paths for the binding picker:
 * every property plus nested object properties (depth-limited); arrays stop
 * at the array itself — element access is a hand edit.
 */
export function flattenOutputPaths(
  schema: Record<string, OutputField> | undefined,
  maxDepth = 3,
): BindingPath[] {
  const paths: BindingPath[] = []
  const walk = (properties: Record<string, OutputField>, prefix: string, depth: number): void => {
    for (const [name, field] of Object.entries(properties)) {
      const path = `${prefix}.${name}`
      paths.push({
        path,
        type: outputFieldToType(field).split('\n')[0]!,
        description: field.description,
      })
      if (field.type === 'object' && field.properties && depth < maxDepth) {
        walk(field.properties, path, depth + 1)
      }
    }
  }
  if (schema) walk(schema, '', 1)
  return paths
}
