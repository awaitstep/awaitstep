import { useState, type ReactElement } from 'react'
import {
  BookOpen,
  Keyboard,
  LogOut,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
  SquareTerminal,
  Sun,
  UserRound,
} from 'lucide-react'
import { useResetMockData } from '../../data/dashboard/reset'
import { handleSignOut } from '../../lib/auth-client'
import { accountPath } from '../../lib/dashboard-paths'
import type { Theme } from '../../lib/theme'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { AccountMenu, type AccountMenuItem } from '../shell/account-menu'
import { useFeatureOn } from '../../lib/feature-switches'
import { mockSourceAllowed } from './dashboard-providers'
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
  /** "Reset dummy data" is a dev tool; production builds leave it out. */
  showReset?: boolean
}

function accountItems(): AccountMenuItem[] {
  return [
    { key: 'profile', label: 'Profile', href: accountPath('profile'), icon: UserRound },
    {
      key: 'sessions',
      label: 'Sessions and sign-in',
      href: accountPath('sessions'),
      icon: Shield,
    },
    {
      key: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      shortcut: '?',
      disabledReason: 'Coming later',
    },
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

/** The account avatar's menu in the dashboard, with its links, sign out and dev tools. */
export function DashboardAccountMenu({
  trigger,
  user,
  placement,
  here,
  org,
  theme,
  onToggleTheme,
  showReset = mockSourceAllowed(import.meta.env.MODE),
}: DashboardAccountMenuProps) {
  const resetMockData = useResetMockData()
  const playground = useFeatureOn('playground')
  const docs = useFeatureOn('docs')
  const extensions = useEnabledExtensions()
  const [confirmReset, setConfirmReset] = useState(false)

  function handleAskReset() {
    setConfirmReset(true)
  }

  function handleReset() {
    setConfirmReset(false)
    void resetMockData()
  }

  function handleSignOutSelect() {
    void handleSignOut()
  }

  const groups: AccountMenuItem[][] = [accountItems()]
  if (placement === 'phone') {
    // The rail's extension entries, as the rail draws them: the phone has no rail.
    // Their org pages (Integrations) too: the tab bar has no room for them.
    const extensionLinks = [
      ...railPrimaryEntries(org, extensions),
      ...railExtensionEntries(extensions, here),
    ].map(({ key, href, icon, label, external }) => ({ key, href, icon, label, external }))
    groups.push(phoneItems(here, theme, onToggleTheme, { playground, docs }, extensionLinks))
  }
  if (showReset) {
    groups.push([
      { key: 'reset', label: 'Reset dummy data', icon: RotateCcw, onSelect: handleAskReset },
    ])
  }
  groups.push([
    {
      key: 'sign-out',
      label: 'Sign out',
      icon: LogOut,
      tone: 'danger',
      onSelect: handleSignOutSelect,
    },
  ])

  return (
    <>
      <AccountMenu
        trigger={trigger}
        user={user}
        groups={groups}
        side={placement === 'rail' ? 'right' : 'bottom'}
        align="end"
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset dummy data?"
        description="Resets the sample data to its original state. Your real account isn’t affected."
        confirmLabel="Reset"
        variant="destructive"
        onConfirm={handleReset}
      />
    </>
  )
}
