import type { AppShortcutHandlers } from '../../lib/shortcuts/dispatcher'
import { focusPageSearch } from '../../lib/shortcuts/page-search'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import { useThemeStore } from '../../stores/theme-store'

/** `?`, `/` and the theme key: what every signed-in page binds, with or without an organization. */
export function useGeneralShortcutHandlers(): AppShortcutHandlers {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const show = useShortcutsStore((s) => s.show)

  function handleSearch() {
    // No search here: `/` stays the browser's.
    return focusPageSearch() ? undefined : false
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handleHelp() {
    show('help')
  }

  return { help: handleHelp, search: handleSearch, theme: handleToggleTheme }
}
