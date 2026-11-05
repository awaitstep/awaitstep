import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Muted text dimmed by an opacity step measured 2.2–3.5:1, under 4.5:1. The
// rule holds for every IDE component, not just the explorer it was found in,
// and for the top bar, its menu and the canvas chrome that wears it.
const IDE_MUTED_STEP = /text-muted-foreground\/(50|60|70)\b/
// Every step below full strength, in the files new enough to have none to grandfather.
const ANY_MUTED_STEP = /text-muted-foreground\/\d+\b/
// A whole element dimmed (`opacity-60`) drags its text under the same ratio;
// `disabled:` states are the one place a dimmed control is the point.
const DIMMED = /(?<!disabled:)(?<![\w-]:)\bopacity-(50|60|70)\b/

const COMPONENTS = join(__dirname, '..', '..')
const ide = readdirSync(join(COMPONENTS, 'ide'))
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => join(COMPONENTS, 'ide', f))
const topBar = [
  ...readdirSync(join(COMPONENTS, 'workflows'))
    .filter((f) => /^(unified-top-bar.*|top-bar-menu|view-switch|workflow-title)\.tsx$/.test(f))
    .map((f) => join(COMPONENTS, 'workflows', f)),
  ...[
    'editor-toolbar.tsx',
    'save-status-indicator.tsx',
    'node-palette.tsx',
    'canvas-side-panels.tsx',
  ].map((f) => join(COMPONENTS, 'canvas', f)),
  join(COMPONENTS, 'ui', 'dropdown-menu.tsx'),
]

describe.each([
  ['IDE', ide, IDE_MUTED_STEP],
  ['top bar and canvas chrome', topBar, ANY_MUTED_STEP],
])('%s text colours', (_name, files, mutedStep) => {
  it('scans the components', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('never dims muted text with an opacity step', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(mutedStep)
    }
  })

  it('never dims a whole element with an opacity step (disabled states aside)', () => {
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(DIMMED)
    }
  })
})

describe('IDE scan', () => {
  it('covers the explorer, side bar and search files the rule was written for', () => {
    expect(ide.length).toBeGreaterThan(20)
    for (const prefix of ['file-explorer', 'side-bar', 'search']) {
      expect(
        ide.some((f) => f.split('/').pop()!.startsWith(prefix)),
        prefix,
      ).toBe(true)
    }
  })
})
