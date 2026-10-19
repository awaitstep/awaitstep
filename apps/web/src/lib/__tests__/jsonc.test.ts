import { describe, expect, it } from 'vitest'
import { parseJsonc } from '../jsonc'

describe('parseJsonc', () => {
  it('accepts comments and trailing commas, as tsconfig files use them', () => {
    const source = `{
      // strictness
      "compilerOptions": {
        "strict": true, /* block
        comment */ "noUnusedLocals": true,
      },
      "include": ["src", ],
    }`
    expect(parseJsonc(source)).toEqual({
      compilerOptions: { strict: true, noUnusedLocals: true },
      include: ['src'],
    })
  })

  it('leaves comment-like and comma-like text inside strings alone', () => {
    expect(parseJsonc('{"url": "https://x/y", "note": "a,]", "esc": "q\\"//z"}')).toEqual({
      url: 'https://x/y',
      note: 'a,]',
      esc: 'q"//z',
    })
  })

  it('is plain JSON for plain JSON and undefined for garbage', () => {
    expect(parseJsonc('{"a": [1, 2]}')).toEqual({ a: [1, 2] })
    expect(parseJsonc('{ not json')).toBeUndefined()
    expect(parseJsonc('')).toBeUndefined()
  })
})
