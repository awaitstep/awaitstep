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
import { DOCS_URL } from './nav-model'

interface DashboardAccountMenuProps {
  /** The rail's or the phone header's avatar. */
  trigger: ReactElement
  user: { name: string; email: string; image: string | null }
  org: string
  /** The phone menu also carries the rail items the tab bar has no room for. */
  placement: 'rail' | 'phone'
  /** The phone menu's What's new: opens over the page you're on, as the rail's does. */
  whatsNewHref: string
  theme: Theme
  onToggleTheme: () => void
  /** "Reset dummy data" is a dev tool; production builds leave it out. */
  showReset?: boolean
}

function accountItems(org: string): AccountMenuItem[] {
  return [
    { key: 'profile', label: 'Profile', href: accountPath(org, 'profile'), icon: UserRound },
    {
      key: 'sessions',
      label: 'Sessions and sign-in',
      href: accountPath(org, 'sessions'),
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
  whatsNewHref: string,
  theme: Theme,
  onToggleTheme: () => void,
): AccountMenuItem[] {
  return [
    { key: 'whats-new', label: 'What’s new', href: whatsNewHref, icon: Sparkles },
    { key: 'api', label: 'API', href: '/api-playground', icon: SquareTerminal },
    { key: 'docs', label: 'Docs', href: DOCS_URL, icon: BookOpen, external: true },
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
  org,
  placement,
  whatsNewHref,
  theme,
  onToggleTheme,
  showReset = import.meta.env.DEV,
}: DashboardAccountMenuProps) {
  const resetMockData = useResetMockData()
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

  const groups: AccountMenuItem[][] = [accountItems(org)]
  if (placement === 'phone') groups.push(phoneItems(whatsNewHref, theme, onToggleTheme))
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
