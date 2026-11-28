import { useAppShortcuts } from '../../hooks/use-app-shortcuts'
import { useGeneralShortcutHandlers } from './general-handlers'
import { ShortcutsSheet } from './shortcuts-sheet'

/**
 * The shortcuts of the pages outside an organization (/dashboard, your account
 * with no org): `?`, `/` and the theme, with the sheet the account menu opens.
 * There is no ⌘K palette: these pages have no org pages to go to.
 */
export function EntryShortcuts() {
  useAppShortcuts('global', useGeneralShortcutHandlers())
  return <ShortcutsSheet />
}
