import type { ReactElement } from 'react'
import {
  BookOpen,
  Keyboard,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  SquareTerminal,
  Sun,
  UserRound,
} from 'lucide-react'
import { handleSignOut } from '../../lib/auth-client'
import { runAppShortcut } from '../../hooks/use-app-shortcuts'
import { usePhoneLayout } from '../../hooks/use-phone-layout'
import { accountPath } from '../../lib/dashboard-paths'
import type { Theme } from '../../lib/theme'
import { AccountMenu, type AccountMenuItem } from '../shell/account-menu'
import { useFeatureOn } from '../../lib/feature-switches'
import { useEnabledExtensions } from '../../extensions/registry'
import { withOverlay } from '../../lib/dashboard-paths'
import { DOCS_URL, railExtensionEntries, railPrimaryEntries } from './nav-model'

interface DashboardAccountMenuProps {
  /** The rail's or the phone header's avatar. */
  trigger: ReactElement
  user: { name: string; email: string; image: string | null }
  /** The phone menu also carries the rail items the tab bar has no room for. */
  placement: 'rail' | 'phone'
  /** The page you're on (path and query): the phone menu's What's new and panels open over it, as the rail's do. */
  here: string
  /** The org whose extension pages the phone menu links. */
  org: string
  theme: Theme
  onToggleTheme: () => void
}

function openShortcutsSheet() {
  runAppShortcut('help')
}

/** Your account's pages, and the shortcuts sheet where there is a keyboard (not on a phone). */
function accountItems(keyboard: boolean): AccountMenuItem[] {
  const shortcuts: AccountMenuItem = {
    key: 'shortcuts',
    label: 'Keyboard shortcuts',
    icon: Keyboard,
    shortcut: '?',
    onSelect: openShortcutsSheet,
  }
  return [
    { key: 'profile', label: 'Profile', href: accountPath('profile'), icon: UserRound },
    {
      key: 'sessions',
      label: 'Sessions and sign-in',
      href: accountPath('sessions'),
      icon: Shield,
    },
    ...(keyboard ? [shortcuts] : []),
  ]
}

function phoneItems(
  here: string,
  theme: Theme,
  onToggleTheme: () => void,
  on: { playground: boolean; docs: boolean },
  extensionLinks: AccountMenuItem[],
): AccountMenuItem[] {
  const api: AccountMenuItem = {
    key: 'api',
    label: 'API',
    href: '/api-playground',
    icon: SquareTerminal,
  }
  const docs: AccountMenuItem = {
    key: 'docs',
    label: 'Docs',
    href: DOCS_URL,
    icon: BookOpen,
    external: true,
  }
  return [
    {
      key: 'whats-new',
      label: 'What’s new',
      href: withOverlay(here, 'whats-new'),
      icon: Sparkles,
    },
    ...(on.playground ? [api] : []),
    ...extensionLinks,
    ...(on.docs ? [docs] : []),
    {
      key: 'theme',
      label: theme === 'dark' ? 'Light mode' : 'Dark mode',
      icon: theme === 'dark' ? Sun : Moon,
      onSelect: onToggleTheme,
    },
  ]
}

function signOutItem(): AccountMenuItem {
  return {
    key: 'sign-out',
    label: 'Sign out',
    icon: LogOut,
    tone: 'danger',
    onSelect: () => void handleSignOut(),
  }
}

/**
 * The avatar's menu in the frame with no org rail (/dashboard, and your account
 * with no organization): your account's pages and sign out.
 */
export function EntryAccountMenu({
  trigger,
  user,
}: Pick<DashboardAccountMenuProps, 'trigger' | 'user'>) {
  const phone = usePhoneLayout()
  return (
    <AccountMenu
      trigger={trigger}
      user={user}
      groups={[accountItems(!phone), [signOutItem()]]}
      side="bottom"
      align="end"
    />
  )
}

/** The account avatar's menu in the dashboard, with its links and sign out. */
export function DashboardAccountMenu({
  trigger,
  user,
  placement,
  here,
  org,
  theme,
  onToggleTheme,
}: DashboardAccountMenuProps) {
  const playground = useFeatureOn('playground')
  const docs = useFeatureOn('docs')
  const extensions = useEnabledExtensions()

  const groups: AccountMenuItem[][] = [accountItems(placement === 'rail')]
  if (placement === 'phone') {
    // The rail's extension entries, as the rail draws them: the phone has no rail.
    // Their org pages (Integrations) too: the tab bar has no room for them.
    const extensionLinks = [
      ...railPrimaryEntries(org, extensions),
      ...railExtensionEntries(extensions, here),
    ].map(({ key, href, icon, label, external }) => ({ key, href, icon, label, external }))
    groups.push(phoneItems(here, theme, onToggleTheme, { playground, docs }, extensionLinks))
  }
  groups.push([signOutItem()])

  return (
    <AccountMenu
      trigger={trigger}
      user={user}
      groups={groups}
      side={placement === 'rail' ? 'right' : 'bottom'}
      align="end"
    />
  )
}
