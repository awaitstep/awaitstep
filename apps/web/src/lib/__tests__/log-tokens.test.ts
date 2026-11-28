import { describe, expect, it } from 'vitest'
import { logTokens, MAX_HIGHLIGHT_CHARS, lineHead } from '../ide/log-tokens'

const kinds = (text: string) => logTokens(text).map((t) => `${t.kind}:${t.text}`)

describe('logTokens', () => {
  it('colours a printed object: keys, strings, numbers, keywords, brackets', () => {
    expect(kinds('{"id": "a\\"b", "n": -1.5e3, "ok": true}')).toEqual([
      'punctuation:{',
      'key:"id"',
      'punctuation::',
      'plain: ',
      'string:"a\\"b"',
      'punctuation:,',
      'plain: ',
      'key:"n"',
      'punctuation::',
      'plain: ',
      'number:-1.5e3',
      'punctuation:,',
      'plain: ',
      'key:"ok"',
      'punctuation::',
      'plain: ',
      'keyword:true',
      'punctuation:}',
    ])
  })

  it.each([
    ['plain words', 'Listening on port'],
    ['a number inside a word', 'v2beta abc123 1.2.3 id-4'],
    ['a keyword inside a word', 'nullable untrue'],
    ['an unclosed quote', 'say "hello'],
  ])('leaves %s uncoloured', (_name, text) => {
    expect(logTokens(text).every((t) => t.kind === 'plain')).toBe(true)
  })

  it.each(['{"a": [1, "b"]}\n  next "line"', '', 'x "y" 3 null'])(
    'gives back the line unchanged when joined (%j)',
    (text) => {
      expect(
        logTokens(text)
          .map((t) => t.text)
          .join(''),
      ).toBe(text)
    },
  )

  it('stays fast on a long line whose quote never closes', () => {
    const text = '{"body":"' + '{\\"a\\":1,'.repeat(15_000)
    const started = performance.now()
    const tokens = logTokens(text)
    expect(performance.now() - started).toBeLessThan(500)
    expect(tokens.map((t) => t.text).join('')).toBe(text)
  })

  it('colours the next line after a quote that never closes', () => {
    expect(kinds('say "hi\n"ok"')).toEqual(['plain:say "hi\n', 'string:"ok"'])
  })

  it('shows a huge line plain', () => {
    const text = '"a",'.repeat(MAX_HIGHLIGHT_CHARS)
    expect(logTokens(text)).toEqual([{ kind: 'plain', text }])
  })
})

describe('lineHead', () => {
  it.each([
    ['Response 200\n{"a":1}', { label: 'Response 200', tone: 'success', rest: '\n{"a":1}' }],
    ['Response 500', { label: 'Response 500', tone: 'success', rest: '' }],
    ['Run complete\n{"n":42}', { label: 'Run complete', tone: 'success', rest: '\n{"n":42}' }],
    ['Run errored\nError: boom', { label: 'Run errored', tone: 'neutral', rest: '\nError: boom' }],
    ['Run waiting', { label: 'Run waiting', tone: 'neutral', rest: '' }],
    ['Response 2000', null],
    ['got Response 200', null],
    ['Run completed', null],
    ['Run forever', null],
  ])('reads %j', (text, expected) => {
    expect(lineHead(text)).toEqual(expected)
  })
})
