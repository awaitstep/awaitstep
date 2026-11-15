import { transform } from 'sucrase'
import { deepestBracket } from './code-text.js'

/** Below this, the deepest brackets are not worth pointing at as the cause. */
const DEEP_BRACKETS = 64

/**
 * TypeScript to JavaScript. The parser recurses once per nesting level, so
 * code nested deep enough runs out of stack: that is reported as nested too
 * deeply, at the deepest brackets when they are deep, never as the stack.
 */
export async function transpileToJS(tsSource: string): Promise<string> {
  try {
    const result = transform(tsSource, {
      transforms: ['typescript'],
      disableESTransforms: true,
    })
    return result.code
  } catch (err) {
    if (!isStackOverflow(err)) throw err
    const deepest = deepestBracket(tsSource)
    const where =
      deepest.depth >= DEEP_BRACKETS
        ? `${deepest.depth} levels of brackets ${position(tsSource, deepest.offset)}`
        : 'simplify the code'
    throw new Error(`Nested too deeply to compile: ${where}`, { cause: err })
  }
}

/** V8's `RangeError: Maximum call stack size exceeded`, or Firefox's `InternalError: too much recursion`. */
function isStackOverflow(err: unknown): boolean {
  if (err instanceof RangeError) return /call stack/i.test(err.message)
  return (
    err instanceof Error &&
    (err.name === 'InternalError' || /too much recursion/i.test(err.message))
  )
}

/** `(line:column)`, 1-based line and 0-based column, as the parser reports positions. */
function position(source: string, offset: number): string {
  let line = 1
  let lineStart = 0
  for (let at = source.indexOf('\n'); at !== -1 && at < offset; at = source.indexOf('\n', at + 1)) {
    line++
    lineStart = at + 1
  }
  return `(${line}:${offset - lineStart})`
}

/** A file that failed to transpile, named so a multi-file project is diagnosable. */
export interface CompileError {
  path: string
  message: string
}

/**
 * Transpiles one file, naming it in the failure. Sucrase reports a position
 * only ("Unexpected token (16:21)"), which says nothing about where to look
 * once a project has more than one file.
 */
export async function transpileFile(path: string, source: string): Promise<string> {
  try {
    return await transpileToJS(source)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Compile error in ${path}: ${message}`, { cause: err })
  }
}

/**
 * Transpiles every file, collecting a result per failure rather than stopping
 * at the first — a read-only view wants the whole list, and a deploy wants to
 * report more than one broken file at a time.
 */
export async function collectCompileErrors(
  files: readonly { path: string; source: string }[],
): Promise<CompileError[]> {
  const errors: CompileError[] = []
  for (const file of files) {
    try {
      await transpileToJS(file.source)
    } catch (err) {
      errors.push({ path: file.path, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return errors
}
