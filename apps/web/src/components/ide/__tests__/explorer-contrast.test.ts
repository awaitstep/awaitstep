import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('explorer text colours', () => {
  it('never dims muted text with an opacity step (they measured 2.2–3.5:1, under 4.5:1)', () => {
    const dir = join(__dirname, '..')
    const files = readdirSync(dir).filter((f) => /^file-explorer.*\.tsx$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/text-muted-foreground\/(50|60|70)\b/)
    }
  })
})
