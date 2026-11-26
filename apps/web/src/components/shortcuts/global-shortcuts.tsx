import { useNavigate } from '@tanstack/react-router'
import { useEnabledExtensions } from '../../extensions/registry'
import { boundAppShortcuts, runAppShortcut, useAppShortcuts } from '../../hooks/use-app-shortcuts'
import { useDisabledFeatures } from '../../lib/feature-switches'
import type { AppShortcutHandlers } from '../../lib/shortcuts/dispatcher'
import { focusPageSearch } from '../../lib/shortcuts/page-search'
import { useShortcutsStore } from '../../stores/shortcuts-store'
import { useThemeStore } from '../../stores/theme-store'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { GlobalPalette } from './global-palette'
import { goTargets, paletteModel, type PaletteItem } from './palette-model'
import { ShortcutsSheet } from './shortcuts-sheet'

interface GlobalShortcutsProps {
  slugs: ScopeSlugs
  /** Where Inbox and What's new open over: the page, or the org's home where there is no frame. */
  overlayBase: string
}

/**
 * The shortcuts every signed-in page has — ⌘K, `?`, `/`, the theme and the
 * `g` keys — with the palette and the sheet they open.
 */
export function GlobalShortcuts({ slugs, overlayBase }: GlobalShortcutsProps) {
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const show = useShortcutsStore((s) => s.show)
  const paletteOpen = useShortcutsStore((s) => s.dialog === 'palette')
  const disabled = useDisabledFeatures()
  const extensions = useEnabledExtensions()

  // The page's own actions are read only while the palette is open.
  const groups = paletteModel({
    slugs,
    overlayBase,
    theme,
    bound: paletteOpen ? boundAppShortcuts() : [],
    disabled,
    extensions,
  })
  // Each `g` key bound only where its page exists here.
  const goHandlers: AppShortcutHandlers = Object.fromEntries(
    Object.entries(goTargets(groups)).map(([id, href]) => [id, () => void navigate({ href })]),
  )

  function handleSearch() {
    // No search here: `/` stays the browser's.
    return focusPageSearch() ? undefined : false
  }

  function handleToggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  function handlePalette() {
    show('palette')
  }

  function handleHelp() {
    show('help')
  }

  function handleSelect(item: PaletteItem) {
    if (item.target.kind === 'shortcut') {
      runAppShortcut(item.target.id)
      return
    }
    if (item.target.external) {
      window.open(item.target.href, '_blank', 'noopener,noreferrer')
      return
    }
    void navigate({ href: item.target.href })
  }

  useAppShortcuts('global', {
    palette: handlePalette,
    help: handleHelp,
    search: handleSearch,
    theme: handleToggleTheme,
    ...goHandlers,
  })

  return (
    <>
      <GlobalPalette groups={groups} onSelect={handleSelect} />
      <ShortcutsSheet />
    </>
  )
}
