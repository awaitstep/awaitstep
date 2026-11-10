/**
 * A tiny literal reader for provider profiles and accessor calls.
 *
 * It deliberately accepts only data — objects, arrays, strings, numbers,
 * booleans and null — so a profile can be read at deploy time without
 * executing user code. Comments and trailing commas are accepted because the
 * IDE treats them as normal TypeScript.
 */

export interface ParsedLiteral {
  value: unknown
  end: number
}

export class ParseError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message)
  }
}

export function parseLiteral(source: string, start: number): ParsedLiteral {
  return new LiteralParser(source).parseValue(start)
}

class LiteralParser {
  constructor(private readonly source: string) {}

  parseValue(start: number): ParsedLiteral {
    const index = skipTrivia(this.source, start)
    const char = this.source[index]
    if (char === '{') return this.parseObject(index)
    if (char === '[') return this.parseArray(index)
    if (char === '"' || char === "'" || char === '`') return parseString(this.source, index)
    if (char === '-' || /\d/.test(char ?? '')) return this.parseNumber(index)
    const word = readIdentifier(this.source, index)
    if (word) {
      if (word.value === 'true') return { value: true, end: word.end }
      if (word.value === 'false') return { value: false, end: word.end }
      if (word.value === 'null') return { value: null, end: word.end }
    }
    throw new ParseError('Expected a literal value', index)
  }

  private parseObject(start: number): ParsedLiteral {
    const value: Record<string, unknown> = {}
    let index = skipTrivia(this.source, start + 1)
    while (index < this.source.length) {
      if (this.source[index] === '}') return { value, end: index + 1 }
      if (this.source.startsWith('...', index)) {
        throw new ParseError('Spreads are not allowed in defineCloudflare()', index)
      }
      let key: string
      if (this.source[index] === '"' || this.source[index] === "'") {
        const parsed = parseString(this.source, index)
        key = String(parsed.value)
        index = parsed.end
      } else {
        const identifier = readIdentifier(this.source, index)
        if (!identifier) throw new ParseError('Expected an object key', index)
        key = identifier.value
        index = identifier.end
      }
      index = skipTrivia(this.source, index)
      if (this.source[index] !== ':') throw new ParseError('Expected ":" after object key', index)
      const parsed = this.parseValue(index + 1)
      value[key] = parsed.value
      index = skipTrivia(this.source, parsed.end)
      if (this.source[index] === ',') {
        index = skipTrivia(this.source, index + 1)
        continue
      }
      if (this.source[index] === '}') return { value, end: index + 1 }
      throw new ParseError('Expected "," or "}" in object', index)
    }
    throw new ParseError('Unclosed object literal', start)
  }

  private parseArray(start: number): ParsedLiteral {
    const value: unknown[] = []
    let index = skipTrivia(this.source, start + 1)
    while (index < this.source.length) {
      if (this.source[index] === ']') return { value, end: index + 1 }
      const parsed = this.parseValue(index)
      value.push(parsed.value)
      index = skipTrivia(this.source, parsed.end)
      if (this.source[index] === ',') {
        index = skipTrivia(this.source, index + 1)
        continue
      }
      if (this.source[index] === ']') return { value, end: index + 1 }
      throw new ParseError('Expected "," or "]" in array', index)
    }
    throw new ParseError('Unclosed array literal', start)
  }

  private parseNumber(start: number): ParsedLiteral {
    const match = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.source.slice(start))
    if (!match) throw new ParseError('Invalid number', start)
    const value = Number(match[0])
    if (!Number.isFinite(value)) throw new ParseError('Invalid number', start)
    return { value, end: start + match[0].length }
  }
}

export function parseString(source: string, start: number): ParsedLiteral {
  const quote = source[start]
  if (quote !== '"' && quote !== "'" && quote !== '`') {
    throw new ParseError('Expected a string literal', start)
  }
  let value = ''
  let index = start + 1
  while (index < source.length) {
    const char = source[index]!
    if (char === quote) return { value, end: index + 1 }
    if (quote === '`' && char === '$' && source[index + 1] === '{') {
      throw new ParseError('Template interpolation is not allowed here', index)
    }
    if (char === '\\') {
      const next = source[index + 1]
      if (next === undefined) throw new ParseError('Unclosed escape', index)
      const escaped = escapeValue(next)
      if (escaped !== null) {
        value += escaped
        index += 2
        continue
      }
      if (next === 'u') {
        const hex = source.slice(index + 2, index + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new ParseError('Invalid unicode escape', index)
        value += String.fromCharCode(parseInt(hex, 16))
        index += 6
        continue
      }
      if (next === 'x') {
        const hex = source.slice(index + 2, index + 4)
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new ParseError('Invalid hex escape', index)
        value += String.fromCharCode(parseInt(hex, 16))
        index += 4
        continue
      }
      value += next
      index += 2
      continue
    }
    value += char
    index += 1
  }
  throw new ParseError('Unclosed string literal', start)
}

function escapeValue(char: string): string | null {
  switch (char) {
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    case 'b':
      return '\b'
    case 'f':
      return '\f'
    case 'v':
      return '\v'
    case '0':
      return '\0'
    case '\\':
      return '\\'
    case "'":
      return "'"
    case '"':
      return '"'
    case '`':
      return '`'
    default:
      return null
  }
}

export function matchingBracket(text: string, open: number, start: string, end: string): number {
  let depth = 0
  for (let index = open; index < text.length; index++) {
    const char = text[index]
    if (char === start) depth += 1
    else if (char === end) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

export function skipTrivia(source: string, start: number): number {
  let index = start
  while (index < source.length) {
    const char = source[index]!
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      index = close === -1 ? source.length : close + 2
      continue
    }
    break
  }
  return index
}

export interface Identifier {
  value: string
  end: number
}

export function readIdentifier(source: string, start: number): Identifier | null {
  const index = skipTrivia(source, start)
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(source.slice(index))
  if (!match) return null
  return { value: match[0], end: index + match[0].length }
}

export function wordAt(source: string, index: number, word: string): boolean {
  if (!source.startsWith(word, index)) return false
  const before = source[index - 1]
  const after = source[index + word.length]
  return !/[A-Za-z0-9_$]/.test(before ?? '') && !/[A-Za-z0-9_$]/.test(after ?? '')
}
