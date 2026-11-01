import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Every action toasts through lib/action-toast.ts. These checks keep it that
// way: each mutation says what it toasts, and nothing else calls sonner.
const TOAST_HOME = 'lib/action-toast.ts'
const TOASTER_HOME = 'components/ui/toaster.tsx'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.(test|stories)\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

// `useMutation(` and `useMutation<A, B>(`; the generics hold no parentheses.
const MUTATION_CALL = /\buseMutation\s*(?:<[^()]*>)?\s*\(/g

/** The text of each `useMutation(...)` call, parentheses balanced. */
export function mutationCalls(source: string): string[] {
  return [...source.matchAll(MUTATION_CALL)].map((match) => {
    const open = match.index + match[0].length - 1
    let depth = 0
    let end = open
    for (; end < source.length; end++) {
      if (source[end] === '(') depth++
      else if (source[end] === ')' && --depth === 0) break
    }
    return source.slice(open, end + 1)
  })
}

export function declaresToast(call: string): boolean {
  return /\bmeta:\s*\{\s*toast:/.test(call)
}

/** A line comment that says something: not empty, not a lint or type directive. */
function isReason(line: string): boolean {
  const comment = /^\s*\/\/\s*(.*)$/.exec(line)?.[1]?.trim()
  return !!comment && !/^(eslint|@ts-|prettier)/.test(comment) && /\w{3,}/.test(comment)
}

/** `toast: 'silent'` needs a comment on the line before it saying why. */
export function silentWithoutReason(source: string): number[] {
  const lines = source.split('\n')
  return lines.flatMap((line, i) =>
    /toast:\s*'silent'/.test(line) && !isReason(lines[i - 1] ?? '') ? [i + 1] : [],
  )
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  source: readFileSync(path, 'utf8'),
}))

describe('action toasts', () => {
  it('finds the mutation calls it checks', () => {
    expect(files.filter((f) => mutationCalls(f.source).length > 0).length).toBeGreaterThan(20)
  })

  it('has every useMutation declare meta.toast', () => {
    const missing = files.flatMap((f) =>
      mutationCalls(f.source)
        .filter((call) => !declaresToast(call))
        .map(() => f.path),
    )
    expect(missing).toEqual([])
  })

  it('gives every silent mutation a reason', () => {
    const bare = files.flatMap((f) => silentWithoutReason(f.source).map((l) => `${f.path}:${l}`))
    expect(bare).toEqual([])
  })

  it('imports sonner only in the toast module and the Toaster', () => {
    const importers = files
      .filter((f) => /(?:from|import\s*\()\s*['"]sonner['"]/.test(f.source))
      .map((f) => f.path)
      .sort()
    expect(importers).toEqual([TOASTER_HOME, TOAST_HOME])
  })

  it('catches a mutation without meta.toast', () => {
    const scratch = `useMutation({ mutationFn: (x: number) => save(x), onSuccess: () => done() })`
    expect(mutationCalls(scratch).map(declaresToast)).toEqual([false])
    const ok = `useMutation({ mutationFn: save, meta: { toast: { success: 'Saved', error: 'No' } } })`
    expect(mutationCalls(ok).map(declaresToast)).toEqual([true])
  })

  it('reads a typed useMutation<T>( call too', () => {
    const typed = `useMutation<Result, Error, number>({ mutationFn: (x) => save(x) })`
    expect(mutationCalls(typed).map(declaresToast)).toEqual([false])
  })

  it('catches a silent mutation with no reason', () => {
    expect(silentWithoutReason(`useMutation({\n  meta: { toast: 'silent' },\n})`)).toEqual([2])
    expect(
      silentWithoutReason(
        `useMutation({\n  // remembers the org\n  meta: { toast: 'silent' },\n})`,
      ),
    ).toEqual([])
    expect(
      silentWithoutReason(
        `useMutation({\n  // eslint-disable-next-line\n  meta: { toast: 'silent' },\n})`,
      ),
    ).toEqual([3])
    expect(silentWithoutReason(` * a JSDoc line\n  meta: { toast: 'silent' },`)).toEqual([2])
  })
})
