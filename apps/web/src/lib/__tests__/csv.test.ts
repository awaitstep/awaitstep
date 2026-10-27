import { describe, expect, it } from 'vitest'
import { datedCsvName, toCsv } from '../csv'

describe('toCsv', () => {
  it('writes the header and rows, numbers and empty cells as they are', () => {
    expect(toCsv(['Name', 'Took (ms)', 'Failed at'], [['Sync', 4200, null]])).toBe(
      'Name,Took (ms),Failed at\nSync,4200,\n',
    )
  })

  it('quotes cells with commas, quotes or line breaks', () => {
    expect(toCsv(['A'], [['a, b'], ['say "hi"'], ['two\nlines']])).toBe(
      'A\n"a, b"\n"say ""hi"""\n"two\nlines"\n',
    )
  })

  it('keeps text a spreadsheet would run as a formula as text', () => {
    for (const start of ['=', '+', '-', '@']) {
      expect(toCsv(['A'], [[`${start}SUM(A1)`]])).toBe(`A\n'${start}SUM(A1)\n`)
    }
  })
})

describe('datedCsvName', () => {
  it('appends the day', () => {
    expect(datedCsvName('acme-audit-log', new Date('2026-10-27T23:00:00Z'))).toBe(
      'acme-audit-log-2026-10-27.csv',
    )
  })
})
