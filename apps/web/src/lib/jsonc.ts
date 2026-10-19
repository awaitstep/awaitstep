/**
 * Parses the JSON-with-comments dialect tsconfig.json conventionally uses:
 * `//` and `/* *\/` comments and trailing commas are allowed, strings are
 * left untouched. Returns undefined when what remains is not valid JSON.
 */
export function parseJsonc(source: string): unknown {
  const out: string[] = []
  const n = source.length
  let i = 0
  while (i < n) {
    const ch = source[i]!
    if (ch === '"') {
      let j = i + 1
      while (j < n && source[j] !== '"') {
        if (source[j] === '\\') j++
        j++
      }
      out.push(source.slice(i, j + 1))
      i = j + 1
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (ch === '}' || ch === ']') dropTrailingComma(out)
    out.push(ch)
    i++
  }
  try {
    return JSON.parse(out.join(''))
  } catch {
    return undefined
  }
}

/** Removes a `,` that sits before the closing bracket with only whitespace in between. */
function dropTrailingComma(out: string[]): void {
  let k = out.length - 1
  while (k >= 0 && /^\s+$/.test(out[k]!)) k--
  if (k >= 0 && out[k] === ',') out.splice(k, 1)
}
