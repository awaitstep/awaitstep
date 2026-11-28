/**
 * Links and copy for the home page (plan/v2-home-positioning.md). Every claim maps to the brief's
 * claims register, a v2 release note, or the Cloud facts the plan records. The message is provider
 * neutral; Cloudflare is named only where it is an option today: bringing your own account to
 * Cloud, self-hosting, and the FAQ on which clouds it runs on.
 */

import { APP_URL, INSTALL_URL } from './site'

export const META = {
  title: 'AwaitStep: Build & Run durable workflows',
  description:
    'Move long-running tasks out of your app. Draw them or write them in TypeScript; AwaitStep retries what fails and shows every step. Cloud or self-hosted.',
}

export const HERO = {
  title: 'Build & Run',
  /** The second line, with its key word set in the brand colour. */
  titleSecond: { before: 'durable ', accent: 'workflows', after: '.' },
  line: 'Draw them or code them in TypeScript. Run them in our cloud, or self-host.',
  modes: [
    { label: 'AwaitStep Cloud', value: 'we run it, nothing to set up', href: APP_URL },
    { label: 'Self-hosted', value: 'open source, on your server', href: INSTALL_URL },
  ],
}

export const LOOP = {
  title: 'From a sketch to work that runs itself.',
  beats: [
    {
      title: 'Build it',
      body: 'On the canvas or in code. Both edit the same steps.',
      alt: 'The AwaitStep canvas: a process drawn as connected steps, a sleep and a wait for an event with its two paths.',
    },
    {
      title: 'Test it',
      body: 'Run one step, or the whole thing in a sandbox.',
      alt: 'The Code view with a test session open: a trigger payload to send and the run’s output as it happens.',
    },
    {
      title: 'Ship it',
      body: 'One deploy page. Every deploy is a version you can roll back.',
      alt: 'The deploy page: the account it goes to, the deploy settings, and what the deploy will do before you confirm.',
    },
    {
      title: 'Watch it',
      body: 'Every step of every run, live. Failures reach your inbox.',
      alt: 'A run page: how long it ran, the version that ran, the path it took and each step with its output.',
    },
  ],
}

export const CODE = {
  title: 'Start on the canvas. Drop into code anytime.',
  line: 'Each step is a TypeScript module. Edit it in a typed editor, search across files and review changes before you save.',
  caption: 'The Code view. The canvas preview on the right follows every edit.',
}

export const KINDS = {
  title: 'Long-running work, or a quick request.',
  workflows: {
    title: 'Workflows',
    body: 'Background work that survives restarts and picks up where it stopped.',
    points: [
      'Retries with backoff',
      'Sleep for a minute or up to a year',
      'Wait for an event, with a timeout path',
      'Parallel paths, races and try / catch',
    ],
  },
  functions: {
    title: 'Functions',
    body: 'A request in, a response out, built and deployed the same way.',
    points: [
      'Your own routes',
      'Steps that retry, inside a request',
      'Choose what it returns',
      'Call it with an API key',
    ],
  },
  facts: [
    { value: '13', label: 'built-in nodes' },
    { value: '45', label: 'integrations, ready to drop in' },
  ],
  more: 'Start from a template, or reuse your own scripts and custom nodes from the Library.',
}

export const SHIP = {
  title: 'See what’s live and what ran.',
  points: [
    { title: 'Versions', body: 'Every deploy is a version. Rolling back asks first.' },
    {
      title: 'Live on each account',
      body: 'See which version runs where, and take one account down alone.',
    },
    {
      title: 'A page for every run',
      body: 'Each step, its attempts, its output and the version that ran.',
    },
    { title: 'Failures find you', body: 'A failed run lands in your inbox and your email.' },
  ],
  caption: 'An overview: what’s live on each account, its versions and its recent runs.',
}

export const TEAMS = {
  title: 'Built for teams, and their agents.',
  rows: [
    {
      title: 'Orgs, projects, workspaces',
      body: 'Admin, editor and viewer roles, invites and an audit log.',
    },
    {
      title: 'API keys scoped to the work',
      body: 'One workspace, or several at once. Start runs from your own systems.',
    },
    {
      title: 'Your coding agent',
      body: 'Install the skill pack, give it a project key, and describe the job you want done.',
    },
  ],
}

/** The two ways to get AwaitStep, and what each one gives you. */
export const EDITIONS = {
  title: 'Use it hosted, or run it yourself.',
  cloud: {
    name: 'AwaitStep Cloud',
    line: 'We run AwaitStep and everything you build. Nothing to install.',
    points: [
      'Runs, logs and alerts built in.',
      'Or bring your own Cloudflare account to run there.',
    ],
    action: 'Start building',
  },
  selfHost: {
    name: 'Self-host',
    line: 'The open-source edition, on your own server.',
    points: [
      'Docker, Node or Cloudflare, with SQLite or Postgres.',
      'Deploys to your Cloudflare account, on its plan.',
      'Your data stays in your database. AGPL-3.0.',
    ],
    action: 'Install guide',
  },
}

export interface FaqEntry {
  /** Stable, so another page can pick a question without matching its wording. */
  id: string
  q: string
  a: string
}

export const FAQ: readonly FaqEntry[] = [
  {
    id: 'own-account',
    q: 'Do I need my own cloud account?',
    a: 'Not on AwaitStep Cloud. Bring your own Cloudflare account if you want your work to run there, and you need one to self-host.',
  },
  {
    id: 'clouds',
    q: 'Which clouds does it run on?',
    a: 'Cloudflare today. More providers are on the way.',
  },
  {
    id: 'read-code',
    q: 'Can I read the code?',
    a: 'Yes. Every file AwaitStep generates, before and after you deploy.',
  },
  {
    id: 'write-code',
    q: 'Do I have to write code?',
    a: 'No. Build on the canvas, and open the code only when a step needs it.',
  },
  {
    id: 'open-source',
    q: 'Is AwaitStep open source?',
    a: 'The self-hosted edition is, under AGPL-3.0.',
  },
  {
    id: 'agents',
    q: 'Can my coding agent build with it?',
    a: 'Yes. Install the skill pack from the docs and give your agent a project API key.',
  },
]

export const CLOSE = {
  statement: 'Get the slow work out of your app.',
}
