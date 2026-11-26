import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { CF_RUNTIME_DTS } from '../cf-runtime-dts'
import { buildWorkflowContextDts } from '../context-dts'
import { EDITOR_LIB_FILES } from '../editor-lib'

/** A step's code type-checked as the editor checks it: its globals, the workflow context, maybe Cloudflare's pack. */
function diagnosticsOf(
  source: string,
  kind: 'workflow' | 'script',
  providerTypes: 'cloudflare' | null,
): string[] {
  const files = new Map([
    [
      '/context.d.ts',
      buildWorkflowContextDts({
        kind,
        nodes: [],
        envVarNames: [],
        bindings: [],
        providerTypes,
        resolveDefinition: () => undefined,
      }),
    ],
    ...(providerTypes === 'cloudflare' ? [['/cf-runtime.d.ts', CF_RUNTIME_DTS] as const] : []),
    ['/step.ts', source],
  ])
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: EDITOR_LIB_FILES,
    moduleDetection: ts.ModuleDetectionKind.Force,
    noEmit: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const read = host.getSourceFile.bind(host)
  host.getSourceFile = (name, version) => {
    const text = files.get(name)
    return text !== undefined ? ts.createSourceFile(name, text, version) : read(name, version)
  }
  host.fileExists = (name) => files.has(name) || ts.sys.fileExists(name)
  const program = ts.createProgram([...files.keys()], options, host)
  return ts
    .getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

// The step from the report: the DOM lib's `window.event` used to win, so
// `event.payload` read as a DOM Event's, and without Cloudflare's pack there
// was no other `event` at all.
const STEP = `
const today = new Date();
const data = { ...event.payload, dateTime: today.toDateString() };
const res = await fetch(new URL('https://example.com'));
console.log(data, res.status, crypto.randomUUID(), new TextEncoder().encode('x'));
setTimeout(() => {}, 1);
`

describe('a step’s scope in the editor', () => {
  it.each([
    ['function', 'script', null],
    ['workflow', 'workflow', null],
    ['workflow on Cloudflare', 'workflow', 'cloudflare'],
  ] as const)(
    'reads event as the run’s in a %s',
    (_name, kind, providerTypes) => {
      expect(diagnosticsOf(STEP, kind, providerTypes)).toEqual([])
    },
    20_000,
  )

  it('gives a workflow’s event its run details, and a function’s only its payload', () => {
    const details = 'console.log(event.instanceId, event.timestamp.getTime());'
    expect(diagnosticsOf(details, 'workflow', null)).toEqual([])
    expect(diagnosticsOf(details, 'script', null)).not.toEqual([])
  }, 20_000)
})
