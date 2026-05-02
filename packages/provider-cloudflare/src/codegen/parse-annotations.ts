/**
 * Parses trigger code for `@kind function name(params) { body }` annotations
 * (e.g. `@fetch function handler(...)`, `@queue function emails(...)`) and
 * extracts them as separate handler declarations. Source code outside annotated
 * functions becomes "module-level" code in strict mode.
 *
 * Two parser modes, auto-detected:
 * - **legacy**: no annotations present. Trigger code is treated as today —
 *   the entire source is the fetch handler body.
 * - **strict**: at least one `@fetch` or `@queue` declaration found.
 *   Annotated functions become individual handlers; everything else at top
 *   level becomes module scope visible to all handlers.
 *
 * The scanner is context-aware: annotation matches inside string literals,
 * template literals, line comments, and block comments are ignored, so docs
 * containing annotation-shaped text don't trigger false matches.
 */
export type ParsedTriggerCode = LegacyParseResult | StrictParseResult

export interface LegacyParseResult {
  mode: 'legacy'
  fetchBody: string
}

export interface StrictParseResult {
  mode: 'strict'
  moduleCode: string
  fetchHandler?: HandlerDecl
  queueHandlers: HandlerDecl[]
}

export interface HandlerDecl {
  name: string
  params: string
  body: string
  line: number
}

export class AnnotationParseError extends Error {
  readonly line: number
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`)
    this.name = 'AnnotationParseError'
    this.line = line
  }
}

const SUPPORTED_KINDS = new Set(['fetch', 'queue'])
const FETCH_HANDLER_NAME = 'handler'
const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

interface RawAnnotation {
  kind: string
  name: string
  params: string
  body: string
  spanStart: number
  spanEnd: number // exclusive
  line: number
}

export function parseAnnotations(source: string): ParsedTriggerCode {
  const annotations = scanAnnotations(source)
  if (annotations.length === 0) {
    return { mode: 'legacy', fetchBody: source }
  }
  return buildStrictResult(source, annotations)
}

function buildStrictResult(source: string, annotations: RawAnnotation[]): StrictParseResult {
  let fetchHandler: HandlerDecl | undefined
  const queueHandlers: HandlerDecl[] = []
  const seenQueueNames = new Set<string>()

  for (const ann of annotations) {
    if (!SUPPORTED_KINDS.has(ann.kind)) {
      throw new AnnotationParseError(
        `Unknown annotation '@${ann.kind}'. Supported: @fetch, @queue`,
        ann.line,
      )
    }
    if (ann.kind === 'fetch') {
      if (ann.name !== FETCH_HANDLER_NAME) {
        throw new AnnotationParseError(
          `@fetch annotation requires function named '${FETCH_HANDLER_NAME}', got '${ann.name}'`,
          ann.line,
        )
      }
      if (fetchHandler) {
        throw new AnnotationParseError('Multiple @fetch handlers declared', ann.line)
      }
      fetchHandler = { name: ann.name, params: ann.params, body: ann.body, line: ann.line }
    } else if (ann.kind === 'queue') {
      if (!VALID_IDENTIFIER.test(ann.name)) {
        throw new AnnotationParseError(
          `@queue function name '${ann.name}' is not a valid identifier`,
          ann.line,
        )
      }
      if (seenQueueNames.has(ann.name)) {
        throw new AnnotationParseError(`Duplicate queue handler '${ann.name}'`, ann.line)
      }
      seenQueueNames.add(ann.name)
      queueHandlers.push({ name: ann.name, params: ann.params, body: ann.body, line: ann.line })
    }
  }

  if (!fetchHandler && queueHandlers.length === 0) {
    throw new AnnotationParseError(
      'Workflow has no entry point. Define @fetch function handler(...) or @queue function NAME(...)',
      1,
    )
  }

  const moduleCode = stripSpans(
    source,
    annotations.map((a) => [a.spanStart, a.spanEnd] as const),
  )

  return { mode: 'strict', moduleCode, fetchHandler, queueHandlers }
}

/**
 * Replaces each `[start, end)` span with whitespace, preserving newlines so
 * downstream tools (sucrase error messages) keep accurate line numbers.
 */
function stripSpans(source: string, spans: Array<readonly [number, number]>): string {
  if (spans.length === 0) return source
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  let out = ''
  let cursor = 0
  for (const [start, end] of sorted) {
    out += source.slice(cursor, start)
    for (let i = start; i < end; i++) {
      out += source[i] === '\n' ? '\n' : ' '
    }
    cursor = end
  }
  out += source.slice(cursor)
  return out
}

// ────────────────────────────────────────────────────────────
// Context-aware scanner
// ────────────────────────────────────────────────────────────

type StackFrame = { type: 'template' } | { type: 'template-expr'; baseBraceDepth: number }

interface ScanState {
  inLineComment: boolean
  inBlockComment: boolean
  inSingleString: boolean
  inDoubleString: boolean
  stack: StackFrame[]
  braceDepth: number
  parenDepth: number
  line: number
}

function makeState(): ScanState {
  return {
    inLineComment: false,
    inBlockComment: false,
    inSingleString: false,
    inDoubleString: false,
    stack: [],
    braceDepth: 0,
    parenDepth: 0,
    line: 1,
  }
}

function inAnyString(s: ScanState): boolean {
  return s.inSingleString || s.inDoubleString
}
function inTemplateBody(s: ScanState): boolean {
  return s.stack.length > 0 && s.stack[s.stack.length - 1]!.type === 'template'
}
function inAnyComment(s: ScanState): boolean {
  return s.inLineComment || s.inBlockComment
}
function atTopLevel(s: ScanState): boolean {
  return (
    s.braceDepth === 0 &&
    s.parenDepth === 0 &&
    s.stack.length === 0 &&
    !inAnyString(s) &&
    !inAnyComment(s)
  )
}

/**
 * Advances the state machine by one character at index `i` and returns the
 * next index to read (typically `i + 1`, but `i + 2` when consuming a
 * two-char token like `//`, `/*`, or `${`).
 */
function step(source: string, i: number, state: ScanState): number {
  const c = source[i]!
  const next = i + 1 < source.length ? source[i + 1]! : ''

  if (c === '\n') state.line++

  // Escape handling inside strings & template bodies
  if ((inAnyString(state) || inTemplateBody(state)) && c === '\\') {
    return i + 2 // skip the escaped character
  }

  if (state.inLineComment) {
    if (c === '\n') state.inLineComment = false
    return i + 1
  }

  if (state.inBlockComment) {
    if (c === '*' && next === '/') {
      state.inBlockComment = false
      return i + 2
    }
    return i + 1
  }

  if (state.inSingleString) {
    if (c === "'") state.inSingleString = false
    return i + 1
  }

  if (state.inDoubleString) {
    if (c === '"') state.inDoubleString = false
    return i + 1
  }

  if (inTemplateBody(state)) {
    if (c === '`') {
      state.stack.pop()
      return i + 1
    }
    if (c === '$' && next === '{') {
      state.stack.push({ type: 'template-expr', baseBraceDepth: state.braceDepth })
      state.braceDepth++
      return i + 2
    }
    return i + 1
  }

  // Inside JS code (top-level OR inside a template-expr `${...}`)
  if (c === '/' && next === '/') {
    state.inLineComment = true
    return i + 2
  }
  if (c === '/' && next === '*') {
    state.inBlockComment = true
    return i + 2
  }
  if (c === "'") {
    state.inSingleString = true
    return i + 1
  }
  if (c === '"') {
    state.inDoubleString = true
    return i + 1
  }
  if (c === '`') {
    state.stack.push({ type: 'template' })
    return i + 1
  }
  if (c === '{') {
    state.braceDepth++
    return i + 1
  }
  if (c === '}') {
    state.braceDepth--
    // If this `}` closes a template-expr (we're back to its base depth), pop
    // the template-expr frame so we re-enter template-body mode.
    const top = state.stack[state.stack.length - 1]
    if (top && top.type === 'template-expr' && top.baseBraceDepth === state.braceDepth) {
      state.stack.pop()
    }
    return i + 1
  }
  if (c === '(') {
    state.parenDepth++
    return i + 1
  }
  if (c === ')') {
    state.parenDepth--
    return i + 1
  }

  return i + 1
}

/**
 * Scans the source for annotations of the form
 *   @<kind> function <name>(<params>) { <body> }
 * Walks the entire source character-by-character with full context tracking
 * (strings/templates/comments/braces). Records every `@<kind>` match seen
 * outside string/comment context — top-level matches become real annotations,
 * non-top-level matches throw if they reference a supported annotation kind.
 */
function scanAnnotations(source: string): RawAnnotation[] {
  interface PendingAnnotation {
    spanStart: number
    line: number
    header: AnnotationHeader
  }
  const pending: PendingAnnotation[] = []
  const state = makeState()
  let i = 0

  while (i < source.length) {
    if (
      source[i] === '@' &&
      !inAnyString(state) &&
      !inAnyComment(state) &&
      !inTemplateBody(state)
    ) {
      const match = matchAnnotationHeader(source, i)
      if (match) {
        if (atTopLevel(state)) {
          pending.push({ spanStart: i, line: state.line, header: match })
        } else if (SUPPORTED_KINDS.has(match.kind)) {
          throw new AnnotationParseError(
            `Annotation '@${match.kind}' must be declared at top level, not inside another function or block`,
            state.line,
          )
        }
      }
    }
    i = step(source, i, state)
  }

  return pending.map(({ spanStart, line, header }) => {
    const bodyEnd = findBodyEnd(source, header.bodyStart, line)
    const body = source.slice(header.bodyStart + 1, bodyEnd)
    return {
      kind: header.kind,
      name: header.name,
      params: header.params,
      body,
      spanStart,
      spanEnd: bodyEnd + 1,
      line,
    }
  })
}

interface AnnotationHeader {
  kind: string
  name: string
  params: string
  bodyStart: number // index of opening `{`
}

const HEADER_REGEX = /^@(\w+)[ \t]+function[ \t]+(\w+)[ \t]*\(([^)]*)\)[ \t\r\n]*\{/

/**
 * Tries to match an annotation header starting at `i`. Returns the parsed
 * fields and the index of the opening `{`, or null if no match.
 */
function matchAnnotationHeader(source: string, i: number): AnnotationHeader | null {
  const remaining = source.slice(i)
  const m = HEADER_REGEX.exec(remaining)
  if (!m) return null
  const fullMatch = m[0]
  const kind = m[1]!
  const name = m[2]!
  const params = m[3]!
  return {
    kind,
    name,
    params,
    bodyStart: i + fullMatch.length - 1, // index of the `{`
  }
}

/**
 * Walks from the opening `{` at `bodyStart` until the matching `}`, respecting
 * nested strings / templates / comments / braces. Returns the index of the
 * matching `}`. Throws if EOF is reached without finding it.
 */
function findBodyEnd(source: string, bodyStart: number, openLine: number): number {
  const inner = makeState()
  // Consume the opening `{` — braceDepth becomes 1.
  let i = step(source, bodyStart, inner)
  while (i < source.length) {
    i = step(source, i, inner)
    // Step has advanced past one or more chars. If brace depth just returned
    // to zero (and we're not inside a string/comment/template/paren), we just
    // processed the matching `}` and `i` is one position past it.
    if (
      inner.braceDepth === 0 &&
      inner.parenDepth === 0 &&
      inner.stack.length === 0 &&
      !inAnyString(inner) &&
      !inAnyComment(inner)
    ) {
      return i - 1
    }
  }
  throw new AnnotationParseError(
    'Unclosed annotated function body — missing matching "}"',
    openLine,
  )
}
