import { describe, expect, it } from 'vitest'
import { projectRootOptions, tsconfigEditorOptions } from '../monaco/project-config'
import { workflowModelPath } from '../monaco/setup'

describe('projectRootOptions', () => {
  it('maps #app/* onto the workflow model root', () => {
    const options = projectRootOptions('wf-1')
    expect(options.baseUrl).toBe('awaitstep://workflow/wf-1/')
    expect(options.paths).toEqual({ '#app/*': ['*'], '#awaitstep/*': ['awaitstep/*'] })
    // The same root every model URI starts with.
    expect(workflowModelPath('wf-1', 'config/env.ts').startsWith(options.baseUrl)).toBe(true)
  })

  it('keeps workflows apart by encoding the id the way model paths do', () => {
    expect(projectRootOptions('a b/c').baseUrl).toBe('awaitstep://workflow/a%20b%2Fc/')
  })
})

describe('tsconfigEditorOptions', () => {
  it('honours strictness switches and ignores everything else', () => {
    expect(
      tsconfigEditorOptions(
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noUnusedLocals: false,
            paths: { '#app/*': ['./evil/*'] },
            types: ['node'],
            lib: ['dom'],
            noImplicitAny: 'yes',
          },
        }),
      ),
    ).toEqual({ strict: true, noUnusedLocals: false })
  })

  it('reads the JSONC dialect tsconfig files conventionally use', () => {
    expect(
      tsconfigEditorOptions(`{
        // comments are fine
        "compilerOptions": { "strict": true, },
      }`),
    ).toEqual({ strict: true })
  })

  it('contributes nothing for missing, malformed or shapeless input', () => {
    expect(tsconfigEditorOptions(undefined)).toEqual({})
    expect(tsconfigEditorOptions('{ not json')).toEqual({})
    expect(tsconfigEditorOptions('[]')).toEqual({})
    expect(tsconfigEditorOptions('{"compilerOptions": 3}')).toEqual({})
    expect(tsconfigEditorOptions('{"extends": "x"}')).toEqual({})
  })
})
