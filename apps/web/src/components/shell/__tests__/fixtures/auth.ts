import type { FooterLink } from '../../auth-layout'

// Canvas sample data for the auth screens: Daniel's three organizations.

export const AUTH_FOOTER_LINKS: FooterLink[] = [
  { label: 'Docs', href: 'https://docs.awaitstep.dev' },
  { label: 'Status', href: 'https://status.awaitstep.dev' },
  { label: 'Privacy', href: '/privacy' },
]

export interface ChooseOrgEntry {
  slug: string
  name: string
  href: string
  meta: string
  badge?: string
}

export const CHOOSE_ORGS: ChooseOrgEntry[] = [
  {
    slug: 'acme',
    name: 'Acme Inc',
    href: '/acme/projects',
    meta: 'Member · 1 project · last opened 2h ago',
    badge: 'Last used',
  },
  {
    slug: 'daniels-sandbox',
    name: 'Daniel’s sandbox',
    href: '/daniels-sandbox/projects',
    meta: 'Owner · 2 projects',
  },
  {
    slug: 'globex',
    name: 'Globex',
    href: '/invite/globex-sample',
    meta: 'Lena Ortiz invited you · Member',
    badge: 'Join',
  },
]
