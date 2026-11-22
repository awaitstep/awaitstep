import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../landing.css', import.meta.url), 'utf8')
const button = readFileSync(new URL('../../ui/button.tsx', import.meta.url), 'utf8')

/** The dashboard tokens the kit Button's classes read (`bg-primary`, `border-border`, `ring-ring`…). */
function buttonTokens(): string[] {
  const names = new Set<string>()
  for (const m of button.matchAll(/(?:bg|text|border|ring)-([a-z]+(?:-[a-z]+)*)/g)) {
    const name = m[1].replace(/\/\d+$/, '')
    if (
      [
        'primary',
        'primary-foreground',
        'primary-ink',
        'secondary',
        'secondary-foreground',
        'accent',
        'accent-foreground',
        'border',
        'ring',
        'input',
        'background',
        'foreground',
        'muted',
        'muted-foreground',
      ].includes(name)
    )
      names.add(name)
  }
  return [...names]
}

describe('the landing’s dark tokens', () => {
  // The landing is dark only inside a dashboard that may be in light mode; a kit Button on it once
  // drew a near-invisible light-theme border on the dark page.
  it('redefines, inside .landing, every dashboard token the kit Button reads', () => {
    const block = /\.landing \{([\s\S]*?)\}/.exec(css)?.[1] ?? ''
    const tokens = buttonTokens()
    expect(tokens.length).toBeGreaterThan(3)
    for (const token of tokens) expect(block, token).toMatch(new RegExp(`--${token}:`))
  })
})
