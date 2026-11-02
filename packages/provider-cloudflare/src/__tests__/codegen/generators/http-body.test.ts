import { describe, it, expect } from 'vitest'
import { isJsonLiteralBody } from '../../../codegen/generators/http-body.js'

describe('isJsonLiteralBody', () => {
  it.each([
    ['an object literal', '{ key: "value" }'],
    ['an array literal', '[1, 2]'],
    ['a literal with surrounding whitespace', '\n  { id: state.id }\n'],
    ['nested brackets', '{ items: [{ a: 1 }, { b: [2, 3] }], fn: f(1) }'],
    ['a closing bracket inside a string', "{ a: \"}\", b: '] \\' }' }"],
    ['a template literal with an expression', '{ a: `x ${ { b: 1 }.b } }` }'],
    ['a comment with a bracket', '{\n  // closing } here\n  a: 1 /* ] */\n}'],
    ['a multi-line literal', '{\n  name: state.name,\n  total: state.total * 100,\n}'],
    ['division after an identifier', '{ total: a / 100 }'],
    ['division after an index', '{ c: d[0] / 3 }'],
  ])('accepts %s', (_, body) => {
    expect(isJsonLiteralBody(body)).toBe(true)
  })

  it.each([
    ['JSON.stringify', 'JSON.stringify({ a: 1 })'],
    ['a string literal', '"a=1"'],
    ['a template literal', '`amount=${state.total}`'],
    ['string concatenation', '"a=" + b'],
    ['an identifier', 'state.payload'],
    ['a constructor', 'new URLSearchParams({ a: "1" })'],
    ['an array that becomes a string', '[a, b].join(",")'],
    ['a property of an object literal', '{ a: 1 }.a'],
    ['a parenthesised literal', '({ a: 1 })'],
    ['a trailing semicolon', '{ a: 1 };'],
    ['an unclosed literal', '{ a: 1'],
    ['an unclosed string', '{ a: "} }'],
    ['an unclosed template expression', '{ a: `${ b `'],
    ['mismatched brackets', '{ a: [1 }'],
    ['an empty body', '   '],
    ['regexes whose brackets balance out', '[/\\[/][0][/]/]'],
    ['a regex holding a closing brace', '{ re: /}/ }'],
    ['a regex after a keyword', '{ a: typeof /x/ }'],
    ['a / after a closing parenthesis', '{ a: f(b) / 2 }'],
    [
      'a regex after if (...) that hides a quote',
      '{f(){if(1)/"/;return "//"}})&&globalThis.EVIL()&&({\nk:()=>{if(1)/}x/}}',
    ],
  ])('rejects %s', (_, body) => {
    expect(isJsonLiteralBody(body)).toBe(false)
  })

  it('answers false instead of overflowing the stack on deeply nested templates', () => {
    const depth = 20_000
    const body = '{ a: ' + '`${'.repeat(depth) + '1' + '}`'.repeat(depth) + ' }'
    expect(() => isJsonLiteralBody(body)).not.toThrow()
    expect(isJsonLiteralBody(body)).toBe(false)
  })
})
