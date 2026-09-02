import { describe, it, expect } from 'vitest'
import { extractImports } from '../../codegen/imports.js'

describe('extractImports', () => {
  it('splits single-line imports from the body', () => {
    const { imports, body } = extractImports(
      "import { z } from 'zod'\nconst n = z.number();\nreturn n.parse(1);",
    )
    expect(imports).toEqual(["import { z } from 'zod'"])
    expect(body).toBe('const n = z.number();\nreturn n.parse(1);')
  })

  it('collects a multi-line named import as one statement', () => {
    const code = "import {\n  a,\n  b,\n} from 'pkg'\nreturn a(b);"
    const { imports, body } = extractImports(code)
    expect(imports).toEqual(["import {\n  a,\n  b,\n} from 'pkg'"])
    expect(body).toBe('return a(b);')
  })

  it('recognizes side-effect imports without consuming body lines', () => {
    const code = 'import "./polyfill";\nconst x = 1;\nreturn x;'
    const { imports, body } = extractImports(code)
    expect(imports).toEqual(['import "./polyfill";'])
    expect(body).toBe('const x = 1;\nreturn x;')
  })

  it('returns code without imports untouched', () => {
    const code = 'const value = await fetch(url);\nreturn value;'
    expect(extractImports(code)).toEqual({ imports: [], body: code })
  })

  it('restores an unterminated import to the body instead of dropping it', () => {
    const code = 'import {\n  a,'
    const { imports, body } = extractImports(code)
    expect(imports).toEqual([])
    expect(body).toBe(code)
  })
})
