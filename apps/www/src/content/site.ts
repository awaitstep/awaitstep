/** The links every page shares: where things live, and what the nav and footer list. */

export const SITE_URL = 'https://awaitstep.dev'
export const APP_URL = 'https://app.awaitstep.dev'
export const REPO_URL = 'https://github.com/awaitstep/awaitstep'
export const DOCS_URL = 'https://docs.awaitstep.dev'
export const INSTALL_URL = `${DOCS_URL}/installation/docker-compose`
export const RELEASES_URL = `${REPO_URL}/releases`
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`

export interface SiteLink {
  label: string
  href: string
}

/** The top nav's text links, in order. The GitHub link and Sign in follow them. */
export const NAV_LINKS: readonly SiteLink[] = [
  { label: 'Use cases', href: '/use-cases' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Changelog', href: '/changelog' },
]

/** The footer's links, in order. */
export const FOOTER_LINKS: readonly SiteLink[] = [
  { label: 'Use cases', href: '/use-cases' },
  { label: 'Integrations', href: '/integrations' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Quickstart', href: `${DOCS_URL}/getting-started/quickstart` },
  { label: 'Self-host', href: INSTALL_URL },
  { label: 'API', href: `${DOCS_URL}/api/rest` },
  { label: 'GitHub', href: REPO_URL },
]

/** The footer's closing line on pages that do not set their own. */
export const DEFAULT_CLOSING = 'Get the slow work out of your app.'

export const NOT_FOUND_PAGE = {
  title: 'Page not found | AwaitStep',
  description: 'There is no page at this address.',
  heading: 'Page not found',
  line: 'There is no page at this address. It may have moved, or the link has a typo.',
  homeLabel: 'Go to the home page',
}
