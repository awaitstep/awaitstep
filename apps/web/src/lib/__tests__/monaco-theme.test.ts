import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composite, contrastRatio, parseColor, toHex } from '../monaco/color'
import { CODE_FONT_FAMILY, remeasureWhenCodeFontLoads, resetRemeasured } from '../monaco/code-font'
import { BASE_EDITOR_OPTIONS, IDE_EDITOR_OPTIONS } from '../monaco/options'
import {
  buildThemeColors,
  readThemeTokens,
  defineAwaitstepThemes,
  monacoTheme,
  resetDefinedThemes,
  type ThemeTokens,
} from '../monaco/theme'

const CSS = readFileSync(resolve(__dirname, '../../styles.css'), 'utf8')

function tokensOf(theme: 'dark' | 'light'): Record<string, string> {
  const block = new RegExp(`html\\.${theme}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(CSS)?.[1] ?? ''
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )
}

const TOKENS = { dark: tokensOf('dark'), light: tokensOf('light') }

function color(theme: 'dark' | 'light', token: string) {
  const parsed = parseColor(TOKENS[theme][token])
  if (!parsed) throw new Error(`${theme} ${token} is not parseable`)
  return parsed
}

describe('colour helpers', () => {
  it('converts oklch tokens to the hex Monaco accepts', () => {
    expect(toHex(parseColor('oklch(1 0 0)')!)).toBe('#ffffff')
    expect(toHex(parseColor('oklch(0 0 0)')!)).toBe('#000000')
    expect(toHex(parseColor('oklch(0.12 0 0)')!)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('keeps alpha as a trailing byte and can flatten it over a background', () => {
    const translucent = parseColor('oklch(1 0 0 / 8%)')!
    expect(toHex(translucent)).toMatch(/^#ffffff14$/)
    const flat = composite(translucent, parseColor('#000000')!)
    expect(toHex(flat)).toBe('#141414')
  })

  it('parses short and long hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(toHex(parseColor('#7be0b5')!)).toBe('#7be0b5')
    expect(parseColor('not-a-colour')).toBeNull()
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio(parseColor('#000')!, parseColor('#fff')!)).toBeCloseTo(21, 1)
    expect(contrastRatio(parseColor('#777777')!, parseColor('#ffffff')!)).toBeCloseTo(4.48, 1)
  })
})

describe('monacoTheme', () => {
  it('maps each app theme to its own awaitstep Monaco theme', () => {
    expect(monacoTheme('dark')).toBe('awaitstep-dark')
    expect(monacoTheme('light')).toBe('awaitstep-light')
  })
})

describe('buildThemeColors', () => {
  it('derives editor, line, gutter, widget and scrollbar colours from the tokens', () => {
    for (const theme of ['dark', 'light'] as const) {
      const tokens = TOKENS[theme] as unknown as ThemeTokens
      const colors = buildThemeColors(tokens)
      const bg = parseColor(tokens['--editor'])!
      const hexOf = (token: keyof ThemeTokens) => toHex(composite(parseColor(tokens[token])!, bg))
      expect(colors['editor.background']).toBe(hexOf('--editor'))
      expect(colors['editorGutter.background']).toBe(colors['editor.background'])
      expect(colors['editor.lineHighlightBackground']).toBe(hexOf('--muted'))
      expect(colors['editorWidget.background']).toBe(hexOf('--surface-overlay'))
      expect(colors['editorWidget.border']).toBe(hexOf('--border'))
      expect(colors['scrollbarSlider.background']).toBe(hexOf('--input'))
      expect(colors['editor.selectionBackground']).toMatch(/^#[0-9a-f]{6}40$/)
      for (const value of Object.values(colors))
        expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
    }
  })

  it('changes with the tokens rather than carrying fixed hex', () => {
    const tokens = { ...TOKENS.dark } as unknown as ThemeTokens
    const before = buildThemeColors(tokens)['editor.background']
    const after = buildThemeColors({ ...tokens, '--editor': 'oklch(0.5 0 0)' })['editor.background']
    expect(after).not.toBe(before)
  })

  it('leaves a token it cannot parse to the base theme', () => {
    const tokens = { ...TOKENS.dark, '--muted': 'var(--nope)' } as unknown as ThemeTokens
    expect(buildThemeColors(tokens)).not.toHaveProperty('editor.lineHighlightBackground')
  })
})

describe('defineAwaitstepThemes', () => {
  beforeEach(() => {
    resetDefinedThemes()
    let className = 'dark'
    vi.stubGlobal('document', {
      documentElement: {
        get className() {
          return className
        },
        set className(v: string) {
          className = v
        },
      },
    })
    vi.stubGlobal('getComputedStyle', () => {
      const tokens = TOKENS[className as 'dark' | 'light']
      return { getPropertyValue: (name: string) => tokens[name] ?? '' }
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('registers both themes up front on the matching bases, resolving each from its own class', () => {
    const defineTheme = vi.fn()
    const monaco = { editor: { defineTheme } }
    defineAwaitstepThemes(monaco as never)
    expect(defineTheme).toHaveBeenCalledTimes(2)
    const byName = Object.fromEntries(defineTheme.mock.calls.map(([n, d]) => [n, d]))
    expect(byName['awaitstep-dark'].base).toBe('vs-dark')
    expect(byName['awaitstep-light'].base).toBe('vs')
    expect(byName['awaitstep-dark'].inherit).toBe(true)
    expect(byName['awaitstep-dark'].colors['editor.background']).not.toBe(
      byName['awaitstep-light'].colors['editor.background'],
    )
    expect(byName['awaitstep-light'].colors['editor.background']).toBe(
      toHex(parseColor(TOKENS.light['--editor'])!),
    )
    expect(document.documentElement.className).toBe('dark')
  })

  it('defines the themes once per Monaco instance', () => {
    const defineTheme = vi.fn()
    const monaco = { editor: { defineTheme } }
    defineAwaitstepThemes(monaco as never)
    defineAwaitstepThemes(monaco as never)
    expect(defineTheme).toHaveBeenCalledTimes(2)
  })
})

describe('code font', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetRemeasured()
  })

  it('puts JetBrains Mono first with a monospace fallback in every IDE option set', () => {
    expect(CODE_FONT_FAMILY.startsWith("'JetBrains Mono Variable'")).toBe(true)
    expect(CODE_FONT_FAMILY.endsWith('monospace')).toBe(true)
    expect(BASE_EDITOR_OPTIONS.fontFamily).toBe(CODE_FONT_FAMILY)
    expect(IDE_EDITOR_OPTIONS.fontFamily).toBe(CODE_FONT_FAMILY)
  })

  it('remeasures only after the font has loaded, once per Monaco', async () => {
    let finish: () => void = () => {}
    const load = vi.fn(() => new Promise<void>((r) => (finish = r)))
    vi.stubGlobal('document', { fonts: { load } })
    const remeasureFonts = vi.fn()
    const monaco = { editor: { remeasureFonts } }
    const done = remeasureWhenCodeFontLoads(monaco as never)
    void remeasureWhenCodeFontLoads(monaco as never)
    expect(load).toHaveBeenCalledTimes(1)
    expect(remeasureFonts).not.toHaveBeenCalled()
    finish()
    await done
    expect(remeasureFonts).toHaveBeenCalledTimes(1)
  })
})

describe('IDE text contrast (WCAG AA 4.5:1)', () => {
  const surfaces = ['--card', '--sidebar', '--background', '--editor']
  const cases: Array<[string, string[]]> = [
    ['--foreground', surfaces],
    ['--muted-foreground', [...surfaces, '--muted', '--sidebar-accent']],
    ['--status-warning', surfaces],
    ['--status-error', surfaces],
    ['--status-success', surfaces],
    ['--status-info', surfaces],
    ['--destructive', surfaces],
    ['--primary', surfaces],
  ]
  for (const theme of ['dark', 'light'] as const) {
    for (const [fg, bgs] of cases) {
      for (const bg of bgs) {
        it(`${theme}: ${fg} on ${bg}`, () => {
          expect(contrastRatio(color(theme, fg), color(theme, bg))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})

describe('readThemeTokens', () => {
  it('puts the page’s class back even if reading a token throws', () => {
    const root = { className: 'light' } as unknown as HTMLElement
    vi.stubGlobal('getComputedStyle', () => {
      throw new Error('boom')
    })
    expect(() => readThemeTokens('dark', root)).toThrow('boom')
    expect(root.className).toBe('light')
    vi.unstubAllGlobals()
  })
})
