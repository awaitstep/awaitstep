import { transform } from 'sucrase'

export async function transpileToJS(tsSource: string): Promise<string> {
  const result = transform(tsSource, {
    transforms: ['typescript'],
    disableESTransforms: true,
  })
  return result.code
}
