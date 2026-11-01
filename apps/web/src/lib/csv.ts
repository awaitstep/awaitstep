// A cell a spreadsheet would run as a formula (OWASP "CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number | null): string {
  if (typeof value === 'number') return String(value)
  const raw = value ?? ''
  // Names and messages are user text: a leading ' keeps them text.
  const text = FORMULA_START.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** A CSV file: the header row, then one line per row, each cell quoted or escaped as needed. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n'
}

/** "sales-runs-2026-10-27.csv". */
export function datedCsvName(stem: string, now: Date = new Date()): string {
  return `${stem}-${now.toISOString().slice(0, 10)}.csv`
}

export const EXPORT_FAILED_COPY =
  'The export didn’t finish. Nothing was downloaded. Try again in a moment.'
