import { scanExpressions } from './parse.js'
import { isTextMap } from './text-fields.js'
import { validateExpressionRefs, type NodeIdSet } from './refs.js'

/** What an expression may name from a node: the nodes before it, and every node by id or variable name. */
export interface ExpressionScope {
  /** The node the value belongs to: it may not name itself. */
  nodeId: string
  /** The nodes that run before it (topologically earlier). */
  upstream: NodeIdSet
  allNodeIds: NodeIdSet
  /** Node ids by the variable name generated code gives them (`fetch_user`). */
  idByName?: ReadonlyMap<string, string>
}

export interface ExpressionProblem {
  /** The `{{ … }}` text at fault (cut short for a long unclosed one). */
  expression: string
  /** Where it starts in the value: an editor marks `start` to `start + expression.length`. */
  start: number
  message: string
}

/** A problem in one of a node's fields: `field` is the data key (`url`, `branches`). */
export interface FieldExpressionProblem extends ExpressionProblem {
  field: string
}

/**
 * Fields whose text is code, not a template: braces there are the language's
 * own, so only a well-formed `{{ … }}` in them is read (and checked) as an
 * expression; anything else is left alone, as codegen leaves it. A step's
 * `code` always is; a node's schema adds its code and JSON fields.
 */
const CODE_FIELDS: ReadonlySet<string> = new Set(['code'])

/**
 * The built-in node types' code and JSON fields (`nodes/registry.json`; a
 * test keeps the two in step), so a caller without the registry — a canvas
 * save, the overview's Deploy — judges them the same as one with it.
 */
export const BUILTIN_CODE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  step: ['code'],
  http_request: ['headers', 'queryParams', 'body'],
  sub_workflow: ['input', 'params'],
  sub_script: ['headers', 'body', 'params'],
}

/**
 * The fields of a node that hold code or JSON rather than template text: a
 * built-in type's own, and its schema's `code` and `json` fields.
 */
export function codeFieldsOf(
  configSchema: Readonly<Record<string, { type: string }>> | undefined,
  type?: string,
): Set<string> {
  const fields = new Set<string>(
    type !== undefined && Object.hasOwn(BUILTIN_CODE_FIELDS, type) ? BUILTIN_CODE_FIELDS[type] : [],
  )
  for (const [fieldId, field] of Object.entries(configSchema ?? {})) {
    if (field.type === 'code' || field.type === 'json') fields.add(fieldId)
  }
  return fields
}

/**
 * The problems in one field value: each `{{ … }}` that isn't a valid
 * expression (empty, bad syntax, never closed), and each that names a node
 * that doesn't exist, runs later, or is the node itself. `event`, `env` and
 * `trigger` are always in scope. A code field is checked for refs only.
 */
export function valueExpressionProblems(
  value: string,
  scope: ExpressionScope,
  options: { code?: boolean } = {},
): ExpressionProblem[] {
  if (!value.includes('{{')) return []
  const problems = options.code ? [] : brokenExpressions(value)
  for (const error of validateExpressionRefs(
    value,
    scope.nodeId,
    scope.upstream,
    scope.allNodeIds,
    scope.idByName,
  )) {
    if (problems.length >= MAX_PROBLEMS_PER_VALUE) break
    problems.push({
      expression: error.expression,
      start: error.start,
      message: refMessage(error.kind, error.ref),
    })
  }
  return problems
}

/**
 * At most this many problems are reported for one value: a field is fixed a
 * few at a time, and a hostile one full of `{{` must not cost more than that.
 */
export const MAX_PROBLEMS_PER_VALUE = 20

/** At most this many for one node, whatever its number of fields. */
export const MAX_PROBLEMS_PER_NODE = 50

/**
 * The problems in a node's fields: every string codegen reads expressions
 * from — each top-level string, the strings one level inside an array (a
 * branch's conditions), and a built-in text map's values (HTTP headers, when
 * `type` names the node type) — so what is flagged is what would ship.
 */
export function nodeExpressionProblems(
  data: Readonly<Record<string, unknown>>,
  scope: ExpressionScope,
  codeFields: ReadonlySet<string> = CODE_FIELDS,
  type?: string,
): FieldExpressionProblem[] {
  const problems: FieldExpressionProblem[] = []
  const check = (field: string, value: string) => {
    if (problems.length >= MAX_PROBLEMS_PER_NODE) return
    const code = CODE_FIELDS.has(field) || codeFields.has(field)
    for (const problem of valueExpressionProblems(value, scope, { code })) {
      if (problems.length >= MAX_PROBLEMS_PER_NODE) return
      problems.push({ field, ...problem })
    }
  }
  for (const [field, value] of Object.entries(data)) {
    if (typeof value === 'string') check(field, value)
    else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') check(field, item)
        else if (item !== null && typeof item === 'object') {
          for (const inner of Object.values(item as Record<string, unknown>)) {
            if (typeof inner === 'string') check(field, inner)
          }
        }
      }
    } else if (isTextMap(type, field, value)) {
      for (const inner of Object.values(value as Record<string, unknown>)) {
        if (typeof inner === 'string') check(field, inner)
      }
    }
  }
  return problems
}

/** Longer content between the braces is not read as an expression (`scanExpressions`). */
const MAX_EXPRESSION_LENGTH = 256

/**
 * The `{{` in a value that don't start a valid expression, one report per
 * run of braces. A run followed by a space is text, as the grammar has
 * always read it (`{{ name }}`, `{{{ html }}}` for a downstream template);
 * so is a `{{` whose second brace starts a valid expression (`{{{a.b}}}`).
 * Every other one is a mistake: empty or bad syntax, too long, or never
 * closed — a later `}}` that closes a valid expression further on doesn't
 * close it.
 */
function brokenExpressions(value: string): ExpressionProblem[] {
  // One pass: the spans are in order, so the span around or after each `{{`
  // and the next `}}` only ever move forward.
  const spans = scanExpressions(value)
  const problems: ExpressionProblem[] = []
  let around = 0
  let close = -1
  let at = value.indexOf('{{')
  while (at !== -1 && problems.length < MAX_PROBLEMS_PER_VALUE) {
    while (around < spans.length && spans[around]!.end <= at) around++
    const span = spans[around]
    // The whole run of braces is one opening: `{{{ x` is text, `{{{{x` one
    // mistake, and a run whose last `{{` starts a valid expression
    // (`{{{a.b}}}`, `{{{{a.b}}}}`) is that expression.
    let runEnd = at + 2
    while (value[runEnd] === '{') runEnd++
    const inSpan = span !== undefined && span.start <= runEnd - 2 && at < span.end
    // A valid expression is passed whole: stepping two braces at a time
    // through a long run in front of it would rescan the run each time.
    let next = inSpan ? span.end : runEnd
    const text = /\s/.test(value[runEnd] ?? '')
    if (!inSpan && !text) {
      // Searched again only once passed: the loop ends at the first `{{`
      // with no `}}` after it, so a -1 is never searched twice.
      if (close < at + 2) close = value.indexOf('}}', at + 2)
      // A valid expression starting before this `{{` closes owns that `}}`.
      const claimed = span !== undefined && close !== -1 && span.start < close
      if (close === -1 || claimed) {
        const end = close === -1 ? value.length : span!.start
        const raw = value.slice(at, Math.min(end, at + 2 + MAX_EXPRESSION_LENGTH))
        problems.push({
          expression: raw,
          start: at,
          message: `“${shown(raw.trimEnd())}” is never closed with }}.`,
        })
        // Nothing after an unclosed `{{` with no `}}` at all can close either.
        if (close === -1) break
      } else {
        const raw = value.slice(at, close + 2)
        problems.push({
          expression: raw,
          start: at,
          message:
            close - (at + 2) > MAX_EXPRESSION_LENGTH
              ? `“${shown(raw)}” is too long for an expression (${MAX_EXPRESSION_LENGTH} characters at most).`
              : `“${shown(raw)}” isn’t a valid expression. Use {{step.field}}, {{event.payload.field}} or {{env.NAME}}.`,
        })
        next = Math.max(next, close + 2)
      }
    }
    at = value.indexOf('{{', next)
  }
  return problems
}

/** Long candidates are cut in messages: a field has no length limit. */
const SHOWN_LENGTH = 40

function shown(raw: string): string {
  return raw.length > SHOWN_LENGTH ? `${raw.slice(0, SHOWN_LENGTH)}…` : raw
}

function refMessage(kind: 'self' | 'missing' | 'downstream', ref: string): string {
  const name = shown(ref)
  switch (kind) {
    case 'self':
      return `“${name}” is this node itself. Use a step that runs before it.`
    case 'missing':
      return `There’s no step called “${name}” in this workflow.`
    case 'downstream':
      return `“${name}” runs after this node. Use a step that runs before it.`
  }
}
