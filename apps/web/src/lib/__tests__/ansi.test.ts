import { describe, expect, it } from 'vitest'
import { parseAnsi } from '../ansi'

describe('parseAnsi', () => {
  it('keeps foreground colors and resets', () => {
    expect(parseAnsi('\u001b[31mERROR\u001b[0m done')).toMatchObject([
      { text: 'ERROR', color: '#f87171' },
      { text: ' done' },
    ])
  })

  it('supports bright colors, bold and background', () => {
    const [segment] = parseAnsi('\u001b[1;92;41mmarked\u001b[0m')
    expect(segment).toMatchObject({
      text: 'marked',
      color: '#86efac',
      background: '#7f1d1d',
      bold: true,
    })
  })

  it('strips non-SGR control sequences', () => {
    expect(parseAnsi('\u001b[2Khello')).toEqual([{ text: 'hello' }])
  })

  it('returns plain text unchanged', () => {
    expect(parseAnsi('plain')).toEqual([{ text: 'plain' }])
  })
})
