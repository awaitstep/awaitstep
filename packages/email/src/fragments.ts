import { FONT, LIGHT, MONO, styleAttr } from './theme.js'

// Controls (CR/LF included), zero-width and direction characters: never in a name a mail shows.
export const UNSAFE_TEXT =
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/g

/** Typed text on one line: line breaks and tabs become a space, other controls and direction overrides go. */
export function inline(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').replace(UNSAFE_TEXT, '')
}

/** A link target a mail may carry: http(s) only, anything else becomes `#`. */
export function safeHref(href: string): string {
  return /^https?:\/\//i.test(inline(href).trim()) ? inline(href).trim() : '#'
}

/** Free text from a client (device, place, sign-in method) cut to a length that can't carry a message. */
export function short(s: string, max = 60): string {
  const one = inline(s).trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Typed text made safe to place in markup: unsafe characters dropped, then escaped. */
export function esc(s: string): string {
  return escapeHtml(inline(s))
}

export interface DetailRow {
  label: string
  value: string
  /** Quieter text after the value, separator included: "in Project 101", "· daniel@acme.test". */
  sub?: string
  mono?: boolean
}

const cell = {
  padding: '12px 0',
  borderBottom: `1px solid ${LIGHT.line}`,
  fontSize: '14.5px',
  lineHeight: '1.5',
  verticalAlign: 'top',
}

/** The label/value table under a headline; empty when there is nothing to show. */
export function detailRows(rows: DetailRow[]): string {
  if (rows.length === 0) return ''
  const body = rows
    .map((row) => {
      const value = row.mono
        ? `<span style="${styleAttr({ fontFamily: MONO, fontSize: '13.5px' })}">${esc(row.value)}</span>`
        : esc(row.value)
      const sub = row.sub
        ? ` <span class="ae-faint" style="color:${LIGHT.faint}">${esc(row.sub)}</span>`
        : ''
      return (
        `<tr>` +
        `<td class="ae-faint ae-line" style="${styleAttr({ ...cell, width: '118px', paddingRight: '20px', fontSize: '13.5px', color: LIGHT.faint })}">${esc(row.label)}</td>` +
        `<td class="ae-text ae-line" style="${styleAttr({ ...cell, color: LIGHT.text, wordBreak: 'break-word' })}">${value}${sub}</td>` +
        `</tr>`
      )
    })
    .join('')
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ae-line" ` +
    `style="${styleAttr({ borderCollapse: 'collapse', borderTop: `1px solid ${LIGHT.line}`, margin: '0 0 30px', fontFamily: FONT })}">` +
    `<tbody>${body}</tbody></table>`
  )
}

/** The last runs as a strip of bars, oldest first: `true` is a run that failed. */
export function runsStrip(failed: boolean[]): string {
  if (failed.length === 0) return ''
  const bars = failed
    .map(
      (f, i) =>
        `<td class="${f ? 'ae-dangerbg' : 'ae-okbg'}" style="${styleAttr({
          height: '7px',
          fontSize: '1px',
          lineHeight: '7px',
          borderRadius: '999px',
          backgroundColor: f ? LIGHT.danger : LIGHT.ok,
          opacity: f ? 1 : 0.45,
        })}">&nbsp;</td>${i < failed.length - 1 ? '<td width="4" style="font-size:1px">&nbsp;</td>' : ''}`,
    )
    .join('')
  const label = `The last ${failed.length} runs, oldest first: ${failed.map((f) => (f ? 'failed' : 'passed')).join(', ')}`
  return (
    `<table role="img" aria-label="${esc(label)}" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px"><tbody><tr>${bars}</tr></tbody></table>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px"><tbody><tr>` +
    `<td class="ae-faint" style="font-size:12.5px;color:${LIGHT.faint}">Last ${failed.length} runs</td>` +
    `<td class="ae-faint" align="right" style="font-size:12.5px;color:${LIGHT.faint}">Now</td></tr></tbody></table>`
  )
}

/** A lead paragraph with the named values in the strong text color. */
export function strong(s: string): string {
  return `<b class="ae-text" style="font-weight:600;color:${LIGHT.text}">${esc(s)}</b>`
}

export function link(href: string, text: string): string {
  return `<a class="ae-link" href="${esc(safeHref(href))}" style="color:${LIGHT.link};font-weight:500;text-decoration:underline">${esc(text)}</a>`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "3 Nov", or "3 Nov 2027" when it is not this year. UTC, so a server in any zone writes the same day. */
export function formatDay(iso: string, now: Date = new Date()): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
  return d.getUTCFullYear() === now.getUTCFullYear() ? day : `${day} ${d.getUTCFullYear()}`
}

/** "31 Oct 2026, 18:47 CET" in `timeZone` (UTC when omitted or unknown). */
export function formatWhen(iso: string, timeZone = 'UTC'): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = (zone: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).formatToParts(d)
  let p: Intl.DateTimeFormatPart[]
  try {
    p = parts(timeZone)
  } catch {
    p = parts('UTC')
  }
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? ''
  return `${get('day')} ${MONTHS[Number(get('month')) - 1]} ${get('year')}, ${get('hour')}:${get('minute')} ${get('timeZoneName')}`
}

/** "00:00 UTC" for the hour a key stops working. */
export function formatClock(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}
