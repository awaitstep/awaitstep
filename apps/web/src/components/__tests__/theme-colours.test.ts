import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// A colour class whose token isn't in the theme compiles to nothing: the
// Inbox once had `bg-popover` and showed the page through it.
const THEME = new Set(
  [...readFileSync(join(SRC, 'styles.css'), 'utf8').matchAll(/--color-([a-z0-9-]+)/g)].map(
    ([, name]) => name!,
  ),
)

// Tailwind's own colours, and the text-/border- utilities that aren't colours.
const NOT_THEME = new Set([
  'black',
  'white',
  'transparent',
  'current',
  'inherit',
  // sizes, alignment and sides
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  'left',
  'center',
  'right',
  'collapse',
  'dashed',
  'dotted',
  'b',
  't',
  'l',
  'r',
  'x',
  'y',
])
// Tailwind palette colours: `bg-red-500` reads as `red` here (the shade is digits).
const PALETTE = /^(red|amber|green|blue|slate|gray|zinc|neutral|emerald|sky)(-|$)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('theme colours', () => {
  it('uses only background, text and border colours the theme defines', () => {
    const unknown = new Set<string>()
    for (const file of [
      ...sourceFiles(join(SRC, 'components')),
      ...sourceFiles(join(SRC, 'routes')),
    ]) {
      const source = readFileSync(file, 'utf8')
      for (const [, , name] of source.matchAll(
        /(?:^|["'`\s:])(bg|text|border)-([a-z][a-z-]*[a-z])/g,
      )) {
        if (THEME.has(name!) || NOT_THEME.has(name!) || PALETTE.test(name!)) continue
        unknown.add(name!)
      }
    }
    expect([...unknown]).toEqual([])
  })
})
