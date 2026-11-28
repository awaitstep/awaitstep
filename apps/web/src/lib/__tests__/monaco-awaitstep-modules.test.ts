import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { AWAITSTEP_MODULES_DTS, CLOUDFLARE_MODULES_DTS } from '../monaco/awaitstep-modules'

describe('awaitstep module ambient types', () => {
  it('declares the neutral modules everywhere and provider primitives only in the provider pack', () => {
    expect(AWAITSTEP_MODULES_DTS).toContain("declare module '#awaitstep/runtime'")
    expect(AWAITSTEP_MODULES_DTS).not.toContain("declare module '#awaitstep/cloudflare'")
    expect(CLOUDFLARE_MODULES_DTS).toContain("declare module '#awaitstep/cloudflare'")
  })

  it('carries the real authoring and provider primitive signatures', () => {
    // The canvas's step-code editors have no bundle models, so these ambient
    // declarations are what give `#awaitstep/*` imports completion/hover.
    expect(AWAITSTEP_MODULES_DTS).toContain('export function defineWorkflow')
    expect(AWAITSTEP_MODULES_DTS).toContain('export function stepArgs')
    expect(CLOUDFLARE_MODULES_DTS).toContain('export function kv')
    expect(CLOUDFLARE_MODULES_DTS).toContain('export function service')
  })

  it('types getInstance and sendEvent on the workflow module for a handler', () => {
    const handler = `import { getInstance, sendEvent } from '#awaitstep/workflow'
import { InstanceNotFoundError } from '#awaitstep/runtime'
export async function handle(env: unknown, id: string): Promise<string> {
  const instance = await getInstance(env, id)
  if (!instance) return 'none'
  await instance.sendEvent('sunny', { temp: 24 })
  const status: string = (await instance.status()).status
  try {
    await sendEvent(env, id, 'sunny')
  } catch (error) {
    if (error instanceof InstanceNotFoundError) return error.instanceId
  }
  // @ts-expect-error the type comes before the payload
  await sendEvent(env, id, { type: 'sunny' })
  return status
}
`
    const files = new Map([
      ['/modules.d.ts', AWAITSTEP_MODULES_DTS],
      ['/handler.ts', handler],
    ])
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    }
    const host = ts.createCompilerHost(options)
    const readFile = host.readFile.bind(host)
    const fileExists = host.fileExists.bind(host)
    const getSourceFile = host.getSourceFile.bind(host)
    host.readFile = (name) => files.get(name) ?? readFile(name)
    host.fileExists = (name) => files.has(name) || fileExists(name)
    host.getSourceFile = (name, language, ...rest) => {
      const source = files.get(name)
      return source === undefined
        ? getSourceFile(name, language, ...rest)
        : ts.createSourceFile(name, source, language)
    }
    const program = ts.createProgram(['/modules.d.ts', '/handler.ts'], options, host)
    const errors = ts
      .getPreEmitDiagnostics(program, program.getSourceFile('/handler.ts'))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    expect(errors).toEqual([])
  })
})
