import { describe, expect, it } from 'vitest'
import type { GeneratedBundle } from '@awaitstep/codegen'
import { compileBundle } from '../compile-bundle.js'

describe('compileBundle', () => {
  it('preserves primary and manifest while renaming code files', async () => {
    const manifest = { irHash: 'abc', steps: [] }
    const bundle: GeneratedBundle = {
      entry: 'worker.ts',
      primary: 'awaitstep/workflow.ts',
      files: [
        { path: 'worker.ts', source: 'export {}', role: 'entry' },
        { path: 'awaitstep/workflow.ts', source: 'export {}', role: 'module' },
      ],
      manifest,
    }

    const compiled = await compileBundle(bundle)

    expect(compiled.entry).toBe('worker.js')
    expect(compiled.primary).toBe('awaitstep/workflow.js')
    expect(compiled.manifest).toBe(manifest)
  })
})
