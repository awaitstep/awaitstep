const PLAIN = /^[A-Za-z0-9_-]$/

/**
 * Text made safe to put in a CSS selector or a quoted attribute value.
 * Everything outside `A-Z a-z 0-9 _ -` becomes a hex escape (`\22 `), so no
 * quote, bracket, brace, backslash, control character or line break is ever
 * left raw: CSS preprocessing turns CR, FF and CRLF into LF, and a raw LF
 * inside a string ends it and lets the rest parse as top-level CSS.
 *
 * Own implementation rather than `CSS.escape`: it exists in jsdom and old
 * test runtimes only sometimes, and one function must back every selector
 * built from an id or a path.
 */
export function escapeCss(text: string): string {
  let out = ''
  let index = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    const leadingDigit = index === 0 && code >= 0x30 && code <= 0x39
    const dashDigit = index === 1 && text[0] === '-' && code >= 0x30 && code <= 0x39
    const loneDash = text.length === 1 && char === '-'
    if (PLAIN.test(char) && !leadingDigit && !dashDigit && !loneDash) out += char
    else out += `\\${code.toString(16)} `
    index += char.length
  }
  return out
}
