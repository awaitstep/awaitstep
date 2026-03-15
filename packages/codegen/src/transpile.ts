import { transform } from 'esbuild'

export async function transpileToJS(tsSource: string): Promise<string> {
  const result = await transform(tsSource, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    minify: false,
  })
  return result.code
}
