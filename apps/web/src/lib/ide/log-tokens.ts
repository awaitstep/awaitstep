/** What a piece of an output line is, for its colour. */
export type LogTokenKind = 'plain' | 'key' | 'string' | 'number' | 'keyword' | 'punctuation'

export interface LogToken {
  kind: LogTokenKind
  text: string
}

/** Past this, a line is shown plain: colouring a huge blob costs more than it tells. */
export const MAX_HIGHLIGHT_CHARS = 200_000

// A quote with no closing quote on its line takes the rest of the line with
// it (and is shown plain): were it to fail instead, every later quote on the
// line would scan to the end again, which is quadratic on a long line.
const TOKEN_RE =
  /("(?:[^"\\\n]|\\.?)*)("|(?=\n|$))(\s*:)?|(?<![\w$.-])(true|false|null|undefined)(?![\w$-])|(?<![\w$.-])(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w$.])|([{}[\],])/g

/**
 * Splits an output line into coloured pieces: quoted strings, the keys of
 * printed objects, numbers, `true`/`false`/`null`, and brackets. The pieces
 * joined are the line, unchanged.
 */
export function logTokens(text: string): LogToken[] {
  if (text.length > MAX_HIGHLIGHT_CHARS) return [{ kind: 'plain', text }]
  const tokens: LogToken[] = []
  let at = 0
  function push(kind: LogTokenKind, piece: string) {
    if (!piece) return
    const last = tokens.at(-1)
    if (last && last.kind === kind) last.text += piece
    else tokens.push({ kind, text: piece })
  }
  for (const match of text.matchAll(TOKEN_RE)) {
    push('plain', text.slice(at, match.index))
    const [whole, quoted, closing, colon, keyword, number, bracket] = match
    if (quoted !== undefined) {
      if (!closing) push('plain', whole)
      else {
        push(colon ? 'key' : 'string', quoted + closing)
        if (colon) push('punctuation', colon)
      }
    } else if (keyword !== undefined) push('keyword', keyword)
    else if (number !== undefined) push('number', number)
    else if (bracket !== undefined) push('punctuation', bracket)
    at = match.index + whole.length
  }
  push('plain', text.slice(at))
  return tokens
}

export type LineHeadTone = 'success' | 'neutral'

/**
 * The heading of a line the panel wrote itself: `Response 200` over a
 * trigger's answer, or `Run complete` (`errored`, `waiting`…) over what the
 * triggered instance did. The label, its tone when the line is not an error,
 * and what follows it.
 */
export function lineHead(text: string): { label: string; tone: LineHeadTone; rest: string } | null {
  const response = /^Response (\d{3})(?=\n|$)/.exec(text)
  if (response) {
    return { label: response[0], tone: 'success', rest: text.slice(response[0].length) }
  }
  const run = /^Run (complete|errored|terminated|waiting|paused)(?=\n|$)/.exec(text)
  if (run) {
    return {
      label: run[0],
      tone: run[1] === 'complete' ? 'success' : 'neutral',
      rest: text.slice(run[0].length),
    }
  }
  return null
}
