import { useThemeStore } from '../../stores/theme-store'
import type { Theme } from '../theme'

/**
 * Monaco's built-in themes, one per app theme. Every editor reads its theme
 * from here so a theme switch moves all of them at once — Monaco applies a
 * theme globally, so one editor left on `vs-dark` would drag the rest with it.
 */
const MONACO_THEMES: Record<Theme, string> = {
  dark: 'vs-dark',
  light: 'vs',
}

export function monacoTheme(theme: Theme): string {
  return MONACO_THEMES[theme]
}

/** The Monaco theme matching the app's current theme. */
export function useMonacoTheme(): string {
  return monacoTheme(useThemeStore((s) => s.theme))
}
