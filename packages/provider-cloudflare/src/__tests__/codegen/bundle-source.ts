import type { GeneratedBundle } from '@awaitstep/codegen'

/**
 * The portable workflow module a bundle carries — the file the IDE shows,
 * as opposed to the provider bootstrap at `bundle.entry`.
 */
export function workflowSource(bundle: GeneratedBundle): string {
  return bundleSource(bundle, 'awaitstep/workflow.ts')
}

/** One bundle file's source, named so a missing file fails loudly. */
export function bundleSource(bundle: GeneratedBundle, path: string): string {
  const file = bundle.files.find((f) => f.path === path)
  if (!file) throw new Error(`bundle has no ${path}`)
  return file.source
}
