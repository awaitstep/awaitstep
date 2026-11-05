import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('IDE text colours', () => {
  it('never dims muted text with an opacity step (they measured 2.2–3.5:1, under 4.5:1)', () => {
    const dir = join(__dirname, '..')
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))
    expect(files.length).toBeGreaterThan(0)
    // The explorer, side bar and search files are the ones this rule was written for.
    for (const prefix of ['file-explorer', 'side-bar', 'search']) {
      expect(
        files.some((f) => f.startsWith(prefix)),
        prefix,
      ).toBe(true)
    }
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/text-muted-foreground\/(50|60|70)\b/)
    }
  })
})
