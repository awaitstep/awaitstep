import { diffLines } from 'diff'

export interface DiffLine {
  kind: 'add' | 'remove' | 'same'
  text: string
}

export interface FileDiff {
  path: string
  /** `added`: only in the newer version; `removed`: only in the older one. */
  status: 'added' | 'removed' | 'changed'
  added: number
  removed: number
  lines: DiffLine[]
}

interface VersionFile {
  path: string
  source: string
}

function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/**
 * Each file that differs between two versions, older → newer, with its
 * line changes and +/− counts (28i). Unchanged files are left out.
 */
export function diffVersions(
  older: readonly VersionFile[],
  newer: readonly VersionFile[],
): FileDiff[] {
  const before = new Map(older.map((f) => [f.path, f.source]))
  const after = new Map(newer.map((f) => [f.path, f.source]))
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  const diffs: FileDiff[] = []
  for (const path of paths) {
    const a = before.get(path)
    const b = after.get(path)
    if (a === b) continue
    const lines: DiffLine[] = []
    let added = 0
    let removed = 0
    for (const part of diffLines(a ?? '', b ?? '')) {
      const kind = part.added ? 'add' : part.removed ? 'remove' : 'same'
      for (const text of splitLines(part.value)) {
        lines.push({ kind, text })
        if (kind === 'add') added++
        if (kind === 'remove') removed++
      }
    }
    diffs.push({
      path,
      status: a === undefined ? 'added' : b === undefined ? 'removed' : 'changed',
      added,
      removed,
      lines,
    })
  }
  return diffs
}

export function diffTotals(diffs: readonly FileDiff[]): { added: number; removed: number } {
  return diffs.reduce(
    (sum, d) => ({ added: sum.added + d.added, removed: sum.removed + d.removed }),
    { added: 0, removed: 0 },
  )
}
