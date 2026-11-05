import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Muted text dimmed by an opacity step measured 2.2–3.5:1, under 4.5:1. The
// rule holds for every IDE component, not just the explorer it was found in.
const MUTED_STEP = /text-muted-foreground\/(50|60|70)\b/
// A whole element dimmed (`opacity-60`) drags its text under the same ratio;
// `disabled:` states are the one place a dimmed control is the point.
const DIMMED = /(?<!disabled:)(?<![\w-]:)\bopacity-(50|60|70)\b/

describe('IDE text colours', () => {
  const dir = join(__dirname, '..')
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'))

  it('scans the IDE components', () => {
    expect(files.length).toBeGreaterThan(20)
    // The explorer, side bar and search files are the ones this rule was written for.
    for (const prefix of ['file-explorer', 'side-bar', 'search']) {
      expect(
        files.some((f) => f.startsWith(prefix)),
        prefix,
      ).toBe(true)
    }
  })

  it('never dims muted text with an opacity step', () => {
    for (const file of files) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(MUTED_STEP)
    }
  })

  it('never dims a whole element with an opacity step (disabled states aside)', () => {
    for (const file of files) {
      expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(DIMMED)
    }
  })
})
