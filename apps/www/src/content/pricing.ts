/**
 * The pricing page's copy. Cloud prices, limits and plan names do not exist yet, so the page
 * states none (plan/www-cloud-pages.md, decision 1): Cloud says its pricing comes at launch, and
 * self-hosting is free under AGPL-3.0. Every other line restates a claim the home page makes.
 */
import { FAQ, type FaqEntry } from './home'
import { BUILTIN_NODES, INTEGRATIONS } from './integrations'
import { APP_URL, INSTALL_URL } from './site'

export interface Plan {
  name: string
  price: string
  priceNote: string
  line: string
  points: string[]
  action: { label: string; href: string }
  primary: boolean
}

export const PLANS: Plan[] = [
  {
    name: 'AwaitStep Cloud',
    price: 'Pricing at launch',
    priceNote: 'Plans and prices are announced when Cloud opens.',
    line: 'We run AwaitStep and everything you build. Nothing to install.',
    points: [
      'Runs, logs and alerts built in.',
      'Or bring your own Cloudflare account to run there.',
      'The same dashboard and sign-in as self-hosting.',
    ],
    action: { label: 'Start building', href: APP_URL },
    primary: true,
  },
  {
    name: 'Self-host',
    price: 'Free',
    priceNote: 'Open source under AGPL-3.0.',
    line: 'The open-source edition, on your own server.',
    points: [
      'Docker, Node or Cloudflare, with SQLite or Postgres.',
      'Deploys to your Cloudflare account, on its plan.',
      'Your data stays in your database.',
    ],
    action: { label: 'Install guide', href: INSTALL_URL },
    primary: false,
  },
]

/** A comparison cell: included, not included, or a short text answer. */
export type Cell = boolean | string

export interface ComparisonRow {
  feature: string
  cloud: Cell
  selfHost: Cell
}

export interface ComparisonGroup {
  title: string
  rows: ComparisonRow[]
}

/** The editions side by side. Every row is a fact the home page or the install docs state. */
export const COMPARISON: ComparisonGroup[] = [
  {
    title: 'Running it',
    rows: [
      { feature: 'Who runs AwaitStep', cloud: 'We do', selfHost: 'You do, on your server' },
      { feature: 'Install', cloud: 'Nothing to install', selfHost: 'Docker or Node' },
      { feature: 'Database', cloud: 'Managed for you', selfHost: 'SQLite or Postgres' },
      {
        feature: 'Where workflows run',
        cloud: 'Our cloud, or your Cloudflare account',
        selfHost: 'Your Cloudflare account',
      },
    ],
  },
  {
    // Every edition has runs, failure notices and the registry's integrations (rows below). What
    // Cloud adds is that we run the infrastructure around them; self-hosting means you do.
    title: 'Run for you on Cloud',
    rows: [
      { feature: 'Observability', cloud: 'Run for you', selfHost: 'Your own setup' },
      { feature: 'Alerts', cloud: 'Run for you', selfHost: 'Your own setup' },
      {
        feature: 'Connections to other services',
        cloud: 'Run for you',
        selfHost: 'Your own setup',
      },
      { feature: 'High availability', cloud: true, selfHost: 'Your own setup' },
    ],
  },
  {
    title: 'Building',
    rows: [
      { feature: 'The canvas and the code editor', cloud: true, selfHost: true },
      { feature: 'Workflows and functions', cloud: true, selfHost: true },
      {
        feature: `${BUILTIN_NODES.length} built-in nodes and ${INTEGRATIONS.length} integrations`,
        cloud: true,
        selfHost: true,
      },
      { feature: 'Test one step or the whole run', cloud: true, selfHost: true },
      { feature: 'Your coding agent, with the skill pack', cloud: true, selfHost: true },
    ],
  },
  {
    title: 'Shipping and watching',
    rows: [
      { feature: 'Versions for every deploy, with rollback', cloud: true, selfHost: true },
      { feature: 'A page for every run, step by step', cloud: true, selfHost: true },
      { feature: 'Failed runs in your inbox and email', cloud: true, selfHost: true },
    ],
  },
  {
    title: 'Teams',
    rows: [
      { feature: 'Orgs, projects and workspaces', cloud: true, selfHost: true },
      { feature: 'Admin, editor and viewer roles', cloud: true, selfHost: true },
      { feature: 'Audit log', cloud: true, selfHost: true },
      { feature: 'API keys scoped to a workspace', cloud: true, selfHost: true },
    ],
  },
]

export const PRICING_PAGE = {
  title: 'Pricing: AwaitStep Cloud and self-hosted',
  description:
    'AwaitStep Cloud, with pricing announced at launch, or the self-hosted edition, free and open source under AGPL-3.0.',
  heading: 'Pricing',
  line: 'Use AwaitStep Cloud, or self-host the open-source edition for free.',
  compareTitle: 'Compare editions',
  compareLine: 'The same product either way. The difference is who runs it.',
  faqTitle: 'Questions',
  faqIds: ['own-account', 'clouds', 'open-source'],
}

/**
 * The home page's questions the pricing page repeats, in its order. Their FAQ markup stays on the
 * home page only, as search engines ask for repeated questions to be marked up once.
 */
export function pricingFaq(faq: readonly FaqEntry[] = FAQ): FaqEntry[] {
  return PRICING_PAGE.faqIds.map((id) => {
    const entry = faq.find((f) => f.id === id)
    if (!entry) throw new Error(`pricing FAQ: no home question with id "${id}"`)
    return entry
  })
}
