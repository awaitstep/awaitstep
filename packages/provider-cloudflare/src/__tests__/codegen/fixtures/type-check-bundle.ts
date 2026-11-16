import ts from 'typescript'
import type { GeneratedBundle } from '@awaitstep/codegen'

const ROOT = '/project/'

/**
 * Type errors in one generated module, checked close to the way the editor
 * does: `#app/` and `#awaitstep/` mapped onto the bundle's own files. The
 * editor maps them through `baseUrl` (Monaco's TS 5.x); this check uses
 * absolute `paths`, since TS 6 refuses `baseUrl`, so bare specifiers the
 * editor might resolve through `baseUrl` are stricter here, never looser.
 */
export function bundleTypeErrors(
  bundle: GeneratedBundle,
  path: string,
  options: { strict?: boolean } = {},
): string[] {
  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    strict: options.strict ?? false,
    noEmit: true,
    skipLibCheck: true,
    paths: { '#app/*': [`${ROOT}*`], '#awaitstep/*': [`${ROOT}awaitstep/*`] },
  }
  const files = new Map(bundle.files.map((file) => [ROOT + file.path, file.source]))
  const host = ts.createCompilerHost(compilerOptions)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)
  host.readFile = (name) => files.get(name) ?? readFile(name)
  host.fileExists = (name) => files.has(name) || fileExists(name)
  host.directoryExists = (name) =>
    name.startsWith(ROOT.slice(0, -1)) || ts.sys.directoryExists(name)
  host.realpath = (name) => name
  host.getSourceFile = (name, language, ...rest) => {
    const source = files.get(name)
    return source === undefined
      ? getSourceFile(name, language, ...rest)
      : ts.createSourceFile(name, source, language)
  }
  const program = ts.createProgram([ROOT + path], compilerOptions, host)
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(ROOT + path))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}
