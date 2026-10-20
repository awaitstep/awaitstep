import { transpileFile } from '@awaitstep/codegen/transpile'
import type { GeneratedBundle, GeneratedFile } from '@awaitstep/codegen'

/**
 * Transpiles a bundle's TypeScript to JavaScript, renaming the code files and
 * the entry to `.js`.
 *
 * Every path that runs a bundle goes through here — deploy, local dev and
 * test sessions. Skipping it leaves `.ts` on disk and `#app/worker` with
 * nothing to resolve to, so a workflow with handler modules fails to start.
 */
export async function compileBundle(bundle: GeneratedBundle): Promise<GeneratedBundle> {
  const files: GeneratedFile[] = await Promise.all(
    bundle.files.map(async (file): Promise<GeneratedFile> => {
      if (file.role !== 'entry' && file.role !== 'module') return file
      const compiled = await transpileFile(file.path, file.source)
      return { ...file, path: file.path.replace(/\.ts$/, '.js'), compiled }
    }),
  )
  const entry = bundle.entry.replace(/\.ts$/, '.js')
  return { entry, files }
}
