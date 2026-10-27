import {
  BookOpen,
  Keyboard,
  LogOut,
  Moon,
  Sparkles,
  SquareTerminal,
  UserRound,
  Shield,
} from 'lucide-react'
import type { AccountMenuItem } from '../../account-menu'

// The AccountMenu board's items (Ama Mensah in Acme Inc), plus the phone-only group.

export const AMA = { name: 'Ama Mensah', email: 'ama@acme.test' }

export const ACCOUNT_GROUPS: AccountMenuItem[][] = [
  [
    { key: 'profile', label: 'Profile', href: '/acme/account/profile', icon: UserRound },
    {
      key: 'sessions',
      label: 'Sessions and sign-in',
      href: '/acme/account/sessions',
      icon: Shield,
    },
    {
      key: 'shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      shortcut: '?',
      disabledReason: 'Coming later',
    },
  ],
  [{ key: 'sign-out', label: 'Sign out', icon: LogOut, tone: 'danger' }],
]

export const PHONE_GROUP: AccountMenuItem[] = [
  { key: 'whats-new', label: 'What’s new', href: '/acme/whats-new', icon: Sparkles },
  { key: 'api', label: 'API', href: '/api-playground', icon: SquareTerminal },
  {
    key: 'docs',
    label: 'Docs',
    href: 'https://docs.awaitstep.dev',
    icon: BookOpen,
    external: true,
  },
  { key: 'theme', label: 'Light mode', icon: Moon },
]
