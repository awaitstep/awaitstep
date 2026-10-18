export interface RankedFile {
  path: string
  score: number
  /** Indices into `path` of the matched query characters, for highlighting. */
  positions: number[]
}

const BOUNDARY_CHARS = new Set(['/', '.', '_', '-'])

/**
 * Subsequence search over bundle paths, VS Code quick-open style: every query
 * character must appear in order; matches at word boundaries, consecutive
 * runs and basename hits score higher, scattered matches lower. Ties break
 * on shorter path, then alphabetically. An empty query lists everything.
 */
export function rankFiles(query: string, paths: readonly string[], limit = 20): RankedFile[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return [...paths]
      .sort((a, b) => a.localeCompare(b, 'en'))
      .slice(0, limit)
      .map((path) => ({ path, score: 0, positions: [] }))
  }

  const ranked: RankedFile[] = []
  for (const path of paths) {
    const match = matchPath(needle, path)
    if (match) ranked.push(match)
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path, 'en'),
  )
  return ranked.slice(0, limit)
}

function matchPath(needle: string, path: string): RankedFile | null {
  const haystack = path.toLowerCase()
  const nameStart = haystack.lastIndexOf('/') + 1
  const positions: number[] = []
  let score = 0
  let from = 0

  for (const char of needle) {
    const index = haystack.indexOf(char, from)
    if (index === -1) return null
    const previous = positions[positions.length - 1]
    if (index === 0 || BOUNDARY_CHARS.has(haystack[index - 1])) score += 10
    else if (previous !== undefined && index === previous + 1) score += 6
    else score += 1
    if (index >= nameStart) score += 2
    positions.push(index)
    from = index + 1
  }

  const name = haystack.slice(nameStart)
  if (name === needle) score += 30
  else if (name.startsWith(needle)) score += 15

  const spread = positions[positions.length - 1] - positions[0] - (needle.length - 1)
  score -= Math.min(spread, 20)

  return { path, score, positions }
}

export interface HighlightSegment {
  text: string
  hit: boolean
}

/**
 * Groups `text` into runs of matched / unmatched characters so a result can
 * be rendered with a handful of spans instead of one per character.
 * `offset` is where `text` starts inside the full path the positions index.
 */
export function splitHighlights(
  text: string,
  positions: readonly number[],
  offset: number,
): HighlightSegment[] {
  const hits = new Set(positions)
  const segments: HighlightSegment[] = []
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(offset + i)
    const last = segments[segments.length - 1]
    if (last && last.hit === hit) last.text += text[i]
    else segments.push({ text: text[i], hit })
  }
  return segments
}
