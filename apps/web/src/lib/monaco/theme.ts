import { loader } from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import { useThemeStore } from '../../stores/theme-store'
import type { Theme } from '../theme'
import { remeasureWhenCodeFontLoads } from './code-font'
import { composite, parseColor, toHex } from './color'

/**
 * One Monaco theme per app theme, defined up front. Every editor reads its
 * theme from here so a theme switch moves all of them at once — Monaco applies
 * a theme globally, so one editor left on another theme would drag the rest.
 */
const MONACO_THEMES: Record<Theme, string> = {
  dark: 'awaitstep-dark',
  light: 'awaitstep-light',
}

const BASES = { dark: 'vs-dark', light: 'vs' } as const

export function monacoTheme(theme: Theme): string {
  return MONACO_THEMES[theme]
}

/** The CSS custom properties a Monaco theme is built from. */
const TOKENS = [
  '--editor',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--input',
  '--primary',
  '--surface-overlay',
  '--sidebar-accent',
] as const

type TokenName = (typeof TOKENS)[number]
export type ThemeTokens = Record<TokenName, string>

/**
 * Reads the tokens as they resolve under `<html class="theme">`. The class is
 * swapped synchronously (no paint in between) and restored, so both themes
 * can be resolved once at setup whichever one is showing.
 */
export function readThemeTokens(theme: Theme, root: HTMLElement = document.documentElement) {
  const previous = root.className
  root.className = theme
  try {
    const style = getComputedStyle(root)
    return Object.fromEntries(
      TOKENS.map((name) => [name, style.getPropertyValue(name).trim()]),
    ) as ThemeTokens
  } finally {
    root.className = previous
  }
}

/** Monaco `colors` for one theme; a token that cannot be parsed is left to the base theme. */
export function buildThemeColors(tokens: ThemeTokens): Record<string, string> {
  const bg = parseColor(tokens['--editor']) ?? { r: 0, g: 0, b: 0, a: 1 }
  // Translucent tokens (borders, inputs) are flattened over the editor so the
  // result is the colour a person sees, not a second alpha layer.
  const solid = (name: TokenName) => {
    const c = parseColor(tokens[name])
    return c ? toHex(composite(c, bg)) : undefined
  }
  const flat = solid
  const primary = solid('--primary')
  const entries: Array<[string, string | undefined]> = [
    ['editor.background', solid('--editor')],
    ['editor.foreground', solid('--foreground')],
    ['editor.lineHighlightBackground', solid('--muted')],
    ['editor.selectionBackground', primary && `${primary.slice(0, 7)}40`],
    ['editor.inactiveSelectionBackground', primary && `${primary.slice(0, 7)}22`],
    ['editorCursor.foreground', primary],
    ['editorLineNumber.foreground', solid('--muted-foreground')],
    ['editorLineNumber.activeForeground', solid('--foreground')],
    ['editorGutter.background', solid('--editor')],
    ['editorWidget.background', solid('--surface-overlay')],
    ['editorWidget.border', flat('--border')],
    ['editorSuggestWidget.background', solid('--surface-overlay')],
    ['editorSuggestWidget.border', flat('--border')],
    ['editorSuggestWidget.selectedBackground', solid('--sidebar-accent')],
    ['editorHoverWidget.background', solid('--surface-overlay')],
    ['editorHoverWidget.border', flat('--border')],
    ['input.background', flat('--input')],
    ['minimap.background', solid('--editor')],
    ['scrollbarSlider.background', flat('--input')],
    ['scrollbarSlider.hoverBackground', flat('--border')],
    ['scrollbarSlider.activeBackground', solid('--muted-foreground')],
  ]
  return Object.fromEntries(entries.filter((e): e is [string, string] => e[1] !== undefined))
}

let defined = new WeakSet<object>()

/** Defines `awaitstep-dark` and `awaitstep-light` from the app's tokens. Idempotent per Monaco instance. */
export function defineAwaitstepThemes(monaco: Pick<Monaco, 'editor'>): void {
  if (defined.has(monaco)) return
  defined.add(monaco)
  for (const theme of ['dark', 'light'] as const) {
    monaco.editor.defineTheme(MONACO_THEMES[theme], {
      base: BASES[theme],
      inherit: true,
      rules: [],
      colors: buildThemeColors(readThemeTokens(theme)),
    })
  }
}

/** Test seam: forget which Monaco instances already have the themes. */
export function resetDefinedThemes(): void {
  defined = new WeakSet<object>()
}

// Editors without a `beforeMount` hook (e.g. the playground response panes)
// still need the themes before they mount; Monaco loads once, and this runs
// ahead of every editor's own continuation on that load.
if (typeof window !== 'undefined') {
  void loader.init().then(
    (monaco) => {
      defineAwaitstepThemes(monaco)
      void remeasureWhenCodeFontLoads(monaco)
    },
    () => {},
  )
}

/** The Monaco theme matching the app's current theme. */
export function useMonacoTheme(): string {
  return monacoTheme(useThemeStore((s) => s.theme))
}
