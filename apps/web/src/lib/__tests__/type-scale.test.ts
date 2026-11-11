import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The dashboard's only sizes, in rem, and their line heights. */
const SCALE: Record<string, { size: string; lineHeight: string }> = {
  '3xs': { size: '0.625rem', lineHeight: '0.875rem' },
  '2xs': { size: '0.6875rem', lineHeight: '1rem' },
  xs: { size: '0.75rem', lineHeight: '1.125rem' },
  sm: { size: '0.875rem', lineHeight: '1.25rem' },
  base: { size: '1rem', lineHeight: '1.5rem' },
  lg: { size: '1.125rem', lineHeight: '1.625rem' },
  xl: { size: '1.25rem', lineHeight: '1.75rem' },
  '2xl': { size: '1.5rem', lineHeight: '2rem' },
  '3xl': { size: '1.875rem', lineHeight: '2.25rem' },
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('type scale', () => {
  const css = readFileSync(join(SRC, 'styles.css'), 'utf8')

  it('defines every step of the documented scale', () => {
    for (const [token, { size, lineHeight }] of Object.entries(SCALE)) {
      expect(css).toContain(`--text-${token}: ${size};`)
      expect(css).toContain(`--text-${token}--line-height: ${lineHeight};`)
    }
  })

  it('defines no step outside the documented scale', () => {
    const defined = [...css.matchAll(/--text-([a-z0-9]+): /g)].map(([, token]) => token)
    expect(new Set(defined)).toEqual(new Set(Object.keys(SCALE)))
  })

  it('sets no font size outside the tokens', () => {
    // `font-size: 13px` and the shorthand `font: 600 13px …` both count.
    expect(css).not.toMatch(/(?:^|[;{\s])font(?:-size)?:[^;{}]{0,200}[0-9.]+(?:px|rem|em)\b/)
  })

  it('gives every step a distinct size', () => {
    const sizes = [...css.matchAll(/--text-[a-z0-9]+: ([^;]+);/g)].map(([, size]) => size)
    expect(new Set(sizes).size).toBe(sizes.length)
  })

  it('uses no ad-hoc font size classes', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/text-\[[0-9.]+(?:px|rem|em)\]/g)) {
        offenders.push(`${file.slice(SRC.length + 1)}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
