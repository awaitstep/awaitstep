import { transform } from 'sucrase'

export async function transpileToJS(tsSource: string): Promise<string> {
  const result = transform(tsSource, {
    transforms: ['typescript'],
    disableESTransforms: true,
  })
  return result.code
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
