import { describe, expect, it } from 'vitest'
// Monaco's own TypeScript worker, run here as the browser runs it: the options
// reach its compiler untouched, which a test on the `typescript` package cannot show.
// @ts-expect-error The worker ships no declarations: it is not meant to be imported.
import { TypeScriptWorker as MonacoWorker } from 'monaco-editor/languages/features/typescript/tsWorker.js'
import { EDITOR_LIB, EDITOR_LIB_FILES } from '../editor-lib'

interface Problem {
  messageText: string | { messageText: string }
}
const TypeScriptWorker = MonacoWorker as new (
  context: object,
  data: object,
) => { getSemanticDiagnostics(file: string): Promise<Problem[]> }

const FILE = 'file:///project/handlers/fetch.ts'
const SOURCE = `export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const timer = setTimeout(() => {}, 1)
  clearTimeout(timer)
  const answer = await fetch(url)
  const all = Object.entries({ ...(await answer.json() as object) })
  return new Response(JSON.stringify(all))
}`

async function problems(lib: readonly string[]): Promise<string[]> {
  const model = {
    uri: { toString: () => FILE, path: '/project/handlers/fetch.ts' },
    version: 1,
    getValue: () => SOURCE,
  }
  const worker = new TypeScriptWorker(
    { getMirrorModels: () => [model] },
    { compilerOptions: { target: 9, module: 99, noEmit: true, lib: [...lib] }, extraLibs: {} },
  )
  const found = await worker.getSemanticDiagnostics(FILE)
  return found.map((problem) =>
    typeof problem.messageText === 'string' ? problem.messageText : problem.messageText.messageText,
  )
}

describe('the globals the editor knows', () => {
  it('finds a Worker’s globals in Monaco’s own TypeScript worker', async () => {
    expect(await problems(EDITOR_LIB_FILES)).toEqual([])
  })

  it('names files: the worker drops a bare lib name without a word', async () => {
    // Why the list is spelled as files. If this stops failing, the bare names would do.
    expect(await problems(EDITOR_LIB)).toContain("Cannot find name 'Response'.")
  })

  it('leaves the page’s globals out, so a step’s own event is not the DOM’s', () => {
    expect(EDITOR_LIB_FILES).not.toContain('lib.dom.d.ts')
    expect(EDITOR_LIB_FILES.every((name) => /^lib\.[a-z0-9.]+\.d\.ts$/.test(name))).toBe(true)
  })
})
