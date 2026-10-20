import type { ProcessLogEntry, TestSessionLogPage } from '@awaitstep/codegen'

/**
 * A container reports its logs as two whole buffers, so a page has to track
 * how far it has read into *each* of them. A single count cannot: once
 * stdout grows, the same count lands at a different place in the combined
 * list, skipping new stdout lines and resending stderr ones — and wrangler
 * writes warnings to stderr in almost every session.
 *
 * The cursor is therefore `"<stdout>:<stderr>"`. A trailing line with no
 * newline is still being written, so it is held back until it is complete
 * rather than delivered in pieces.
 */
export function logPageFromBuffers(
  buffers: { stdout?: string; stderr?: string },
  after?: string,
  now: number = Date.now(),
): TestSessionLogPage {
  const seen = parseCursor(after)
  const stdout = completeLines(buffers.stdout)
  const stderr = completeLines(buffers.stderr)

  const entries: ProcessLogEntry[] = [
    ...stdout
      .slice(seen.stdout)
      .map((text) => ({ timestamp: now, stream: 'stdout' as const, text })),
    ...stderr
      .slice(seen.stderr)
      .map((text) => ({ timestamp: now, stream: 'stderr' as const, text })),
  ]
  return { entries, cursor: `${stdout.length}:${stderr.length}` }
}

/**
 * A page over entries that already carry their own clock and arrive in one
 * ordered stream (the node runner's log file). The cursor counts every entry
 * ever appended, so it keeps advancing even once old entries are dropped.
 */
export function logPageFromEntries(
  entries: readonly ProcessLogEntry[],
  total: number,
  after?: string,
): TestSessionLogPage {
  const seen = Number.parseInt(after ?? '0', 10)
  const from = Number.isFinite(seen) && seen > 0 ? seen : 0
  // `total` counts entries ever written; the oldest may already be gone.
  const dropped = Math.max(0, total - entries.length)
  return { entries: entries.slice(Math.max(0, from - dropped)), cursor: String(total) }
}

function completeLines(buffer: string | undefined): string[] {
  if (!buffer) return []
  const lines = buffer.split('\n')
  // Anything after the final newline is a partial write still in flight.
  lines.pop()
  return lines.filter((line) => line.length > 0)
}

function parseCursor(after: string | undefined): { stdout: number; stderr: number } {
  const [stdout, stderr] = (after ?? '').split(':').map((part) => Number.parseInt(part, 10))
  return {
    stdout: Number.isFinite(stdout) && stdout > 0 ? stdout : 0,
    stderr: Number.isFinite(stderr) && stderr > 0 ? stderr : 0,
  }
}
