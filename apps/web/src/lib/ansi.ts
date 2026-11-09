const ESC = String.fromCharCode(27)

export interface AnsiSegment {
  text: string
  color?: string
  background?: string
  bold?: boolean
  dim?: boolean
}

const FOREGROUND: Record<number, string> = {
  30: '#9ca3af',
  31: '#f87171',
  32: '#4ade80',
  33: '#facc15',
  34: '#60a5fa',
  35: '#e879f9',
  36: '#22d3ee',
  37: '#e5e7eb',
  90: '#6b7280',
  91: '#fca5a5',
  92: '#86efac',
  93: '#fde047',
  94: '#93c5fd',
  95: '#f0abfc',
  96: '#67e8f9',
  97: '#f9fafb',
}

const BACKGROUND: Record<number, string> = {
  40: '#111827',
  41: '#7f1d1d',
  42: '#14532d',
  43: '#713f12',
  44: '#1e3a8a',
  45: '#701a75',
  46: '#164e63',
  47: '#374151',
  100: '#1f2937',
  101: '#991b1b',
  102: '#166534',
  103: '#854d0e',
  104: '#1e40af',
  105: '#86198f',
  106: '#155e75',
  107: '#4b5563',
}

type Style = Omit<AnsiSegment, 'text'>

function applySgr(style: Style, params: string): Style {
  const next: Style = { ...style }
  const codes = params === '' ? [0] : params.split(';').map(Number)
  for (const code of codes) {
    if (code === 0) {
      delete next.color
      delete next.background
      next.bold = false
      next.dim = false
    } else if (code === 1) next.bold = true
    else if (code === 2) next.dim = true
    else if (code === 22) {
      next.bold = false
      next.dim = false
    } else if (code === 39) delete next.color
    else if (code === 49) delete next.background
    else if (FOREGROUND[code]) next.color = FOREGROUND[code]
    else if (BACKGROUND[code]) next.background = BACKGROUND[code]
  }
  return next
}

/** Split terminal output into styled spans, keeping wrangler's ANSI colors. */
export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const pattern = new RegExp(`${ESC}\\[([0-9;]*)m`, 'g')
  let style: Style = {}
  let last = 0
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ ...style, text: input.slice(last, index) })
    style = applySgr(style, match[1] ?? '')
    last = index + match[0].length
  }
  if (last < input.length) segments.push({ ...style, text: input.slice(last) })
  // Drop non-SGR control sequences (cursor moves, clearing) from the text.
  return segments
    .map((segment) => ({
      ...segment,
      text: segment.text.replace(new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'g'), ''),
    }))
    .filter((segment) => segment.text.length > 0)
}
