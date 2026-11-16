import ts from 'typescript'

const ROOT = '/bundle/'
const CANNOT_FIND_NAME = new Set([2304, 2552])

const OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  strict: false,
  noImplicitAny: false,
  skipLibCheck: true,
  types: [],
}

/**
 * Every "Cannot find name" in the generated workflow and its step and node
 * modules: a name the code reads that nothing passes in or declares.
 * Imports that don't resolve here (the runtime, the env types) are ignored.
 */
export function unknownNames(files: { path: string; source: string }[]): string[] {
  const sources = new Map(
    files
      .filter((f) => /^(awaitstep\/workflow|steps\/|nodes\/).*\.ts$/.test(f.path))
      .map((f) => [ROOT + f.path, f.source]),
  )
  const host = ts.createCompilerHost(OPTIONS)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.getSourceFile = (name, language, ...rest) => {
    const source = sources.get(name)
    return source !== undefined
      ? ts.createSourceFile(name, source, language)
      : getSourceFile(name, language, ...rest)
  }
  host.fileExists = (name) => sources.has(name) || fileExists(name)
  host.readFile = (name) => sources.get(name) ?? readFile(name)

  const program = ts.createProgram([...sources.keys()], OPTIONS, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => CANNOT_FIND_NAME.has(d.code) && d.file?.fileName.startsWith(ROOT))
    .map(
      (d) =>
        `${d.file!.fileName.slice(ROOT.length)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`,
    )
}
