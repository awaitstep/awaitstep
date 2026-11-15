import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MUTED_DIAGNOSTIC_CODES, workflowModelPath } from '../../lib/monaco/setup'
import { useProjectLanguageService } from '../use-project-language-service'

const monaco = vi.hoisted(() => ({ current: null as unknown }))
const acquisition = vi.hoisted(() => ({ files: [] as ReadonlyMap<string, unknown>[] }))

vi.mock('../../lib/monaco/runtime', () => ({ useMonaco: () => monaco.current }))
vi.mock('../../lib/monaco/theme', () => ({ defineAwaitstepThemes: vi.fn() }))
vi.mock('../../lib/monaco/code-font', () => ({
  remeasureWhenCodeFontLoads: () => Promise.resolve(),
}))
vi.mock('../../lib/monaco/use-type-acquisition', () => ({
  useTypeAcquisition: (files: ReadonlyMap<string, unknown>) => {
    acquisition.files.push(files)
    return true
  },
}))

class FakeModel {
  disposed = false
  constructor(
    readonly uriString: string,
    private value: string,
  ) {}
  uri = { toString: () => this.uriString }
  getValue() {
    return this.value
  }
  setValue(value: string) {
    this.value = value
  }
  dispose() {
    this.disposed = true
  }
  isDisposed() {
    return this.disposed
  }
}

function languageDefaults() {
  let diagnostics: unknown = {}
  return {
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn((options: unknown) => {
      diagnostics = options
    }),
    getDiagnosticsOptions: () => diagnostics,
    setEagerModelSync: vi.fn(),
    addExtraLib: vi.fn((_content: string, _uri: string) => ({ dispose: vi.fn() })),
  }
}

/** Enough of Monaco for the hook: models, the two language services, and what `configureMonaco` touches. */
function fakeMonaco() {
  const models: FakeModel[] = []
  const typescriptDefaults = languageDefaults()
  const javascriptDefaults = languageDefaults()
  return {
    models,
    typescriptDefaults,
    javascriptDefaults,
    editor: {
      getModels: () => models,
      createModel(value: string, _language: string, uri: unknown) {
        const model = new FakeModel(String(uri), value)
        models.push(model)
        return model
      },
      defineTheme: vi.fn(),
      remeasureFonts: vi.fn(),
      onDidCreateEditor: vi.fn(),
      getEditors: () => [],
    },
    Uri: { parse: (value: string) => value },
    typescript: {
      typescriptDefaults,
      javascriptDefaults,
      // Monaco's own enums: no ES2022 member.
      ScriptTarget: { ES2015: 2, ES2017: 4, ES2020: 7, ESNext: 99 },
      ModuleKind: { ESNext: 99 },
    },
  }
}

type Fake = ReturnType<typeof fakeMonaco>

function lastCompilerOptions(fake: Fake): Record<string, unknown> {
  const calls = fake.typescriptDefaults.setCompilerOptions.mock.calls
  return calls[calls.length - 1]![0] as Record<string, unknown>
}

function lastIgnoredCodes(fake: Fake): number[] {
  const calls = fake.typescriptDefaults.setDiagnosticsOptions.mock.calls
  return (calls[calls.length - 1]![0] as { diagnosticCodesToIgnore: number[] })
    .diagnosticCodesToIgnore
}

const files = new Map([
  ['lib/x.ts', { source: 'export const x = 1' }],
  ['data/a.json', { source: '{"a":1}' }],
  ['tsconfig.json', { source: '{ "compilerOptions": { "strict": true } }' }],
])

beforeEach(() => {
  acquisition.files.length = 0
})

describe('useProjectLanguageService', () => {
  it('does nothing until Monaco has loaded', () => {
    monaco.current = null
    renderHook(() => useProjectLanguageService('wf', files, { reportUnresolvedImports: true }))
    // Nothing to assert against but the absence of a crash: no Monaco, no models.
  })

  it('makes the project a program: a model per file, its JSON declared, the workflow root and the tsconfig switches', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    renderHook(() => useProjectLanguageService('wf', files, { reportUnresolvedImports: true }))
    // configureMonaco keeps typing in its editors away from React Flow graphs.
    expect(fake.editor.onDidCreateEditor).toHaveBeenCalledTimes(1)
    expect(fake.models.map((m) => m.uriString).sort()).toEqual(
      ['data/a.json', 'lib/x.ts', 'tsconfig.json'].map((f) => workflowModelPath('wf', f)).sort(),
    )
    expect(fake.typescriptDefaults.addExtraLib).toHaveBeenCalledWith(
      expect.stringContaining('declare const value'),
      workflowModelPath('wf', 'data/a.d.json.ts'),
    )
    const options = lastCompilerOptions(fake)
    expect(options.baseUrl).toBe(workflowModelPath('wf', ''))
    expect(options.paths).toEqual({
      '#app/*': ['*'],
      '#awaitstep/*': ['awaitstep/*'],
      '#modules/*': ['modules/*', 'modules/*/index.ts'],
    })
    expect(options.strict).toBe(true)
    // The JavaScript service gets the same program.
    expect(fake.javascriptDefaults.setCompilerOptions).toHaveBeenLastCalledWith(options)
  })

  it('targets ES2022, so the editor loads a lib that has Object.entries', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    renderHook(() => useProjectLanguageService('wf', files, { reportUnresolvedImports: true }))
    const { target } = lastCompilerOptions(fake)
    // Monaco's worker picks its default lib this way, falling back to the
    // ES2015 lib when the file doesn't exist (an undefined target never does).
    expect(`lib.es${2013 + ((target as number | undefined) || 99)}.full.d.ts`).toBe(
      'lib.es2022.full.d.ts',
    )
  })

  it('reports unresolved imports for the code workspace once types have settled', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    renderHook(() => useProjectLanguageService('wf', files, { reportUnresolvedImports: true }))
    expect(acquisition.files.at(-1)).toBe(files)
    expect(lastIgnoredCodes(fake)).not.toContain(2307)
  })

  it('keeps them muted for the canvas, and fetches no declarations for it', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    renderHook(() => useProjectLanguageService('wf', files, { reportUnresolvedImports: false }))
    expect(acquisition.files.at(-1)?.size).toBe(0)
    expect(lastIgnoredCodes(fake)).toEqual(MUTED_DIAGNOSTIC_CODES)
    // The models and the root are there all the same: that is what resolves `#app/*`.
    expect(fake.models).toHaveLength(3)
    expect(lastCompilerOptions(fake).baseUrl).toBe(workflowModelPath('wf', ''))
  })

  it('never lays one workflow’s libs or switches under another’s root while the pause runs', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    const view = renderHook(
      (props: { workflowId: string }) =>
        useProjectLanguageService(props.workflowId, files, { reportUnresolvedImports: true }),
      { initialProps: { workflowId: 'wf' } },
    )
    expect(lastCompilerOptions(fake).strict).toBe(true)
    fake.typescriptDefaults.addExtraLib.mockClear()
    view.rerender({ workflowId: 'wf2' })
    // The models follow at once; the libs and the tsconfig wait for the pause.
    expect(fake.models.filter((m) => !m.disposed).map((m) => m.uriString)).toContain(
      workflowModelPath('wf2', 'lib/x.ts'),
    )
    const options = lastCompilerOptions(fake)
    expect(options.baseUrl).toBe(workflowModelPath('wf2', ''))
    // The shared base (`strict: false`), not the previous project's switch.
    expect(options.strict).toBe(false)
    const addedForNew = fake.typescriptDefaults.addExtraLib.mock.calls.filter(([, uri]) =>
      String(uri).startsWith(workflowModelPath('wf2', '')),
    )
    expect(addedForNew).toHaveLength(0)
  })

  it('follows the files, and leaves the shared defaults behind on unmount', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    const view = renderHook(
      (props: { files: ReadonlyMap<string, { source: string }> }) =>
        useProjectLanguageService('wf', props.files, { reportUnresolvedImports: true }),
      { initialProps: { files } },
    )
    const smaller = new Map([['lib/x.ts', { source: 'export const x = 2' }]])
    view.rerender({ files: smaller })
    const live = fake.models.filter((m) => !m.disposed)
    expect(live.map((m) => m.uriString)).toEqual([workflowModelPath('wf', 'lib/x.ts')])
    expect(live[0]!.getValue()).toBe('export const x = 2')

    view.unmount()
    expect(fake.models.every((m) => m.disposed)).toBe(true)
    expect(lastCompilerOptions(fake).baseUrl).toBeUndefined()
    expect(lastIgnoredCodes(fake)).toEqual(MUTED_DIAGNOSTIC_CODES)
  })

  it('re-checks every file when a file appears or goes, not when one only changes', () => {
    const fake = fakeMonaco()
    monaco.current = fake
    const view = renderHook(
      (props: { files: ReadonlyMap<string, { source: string }> }) =>
        useProjectLanguageService('wf', props.files, { reportUnresolvedImports: true }),
      { initialProps: { files } },
    )
    const checks = () => fake.typescriptDefaults.setDiagnosticsOptions.mock.calls.length
    const before = checks()
    const edited = new Map(files)
    edited.set('lib/x.ts', { source: 'export const x = 2' })
    view.rerender({ files: edited })
    expect(checks()).toBe(before)

    // A Library module laid in for an unsaved import: its importer must be re-checked.
    const withModule = new Map(edited)
    withModule.set('modules/solo/index.ts', { source: 'export const a = 1' })
    view.rerender({ files: withModule })
    expect(checks()).toBe(before + 1)
    expect(lastIgnoredCodes(fake)).not.toContain(2307)

    view.rerender({ files: edited })
    expect(checks()).toBe(before + 2)
  })
})
