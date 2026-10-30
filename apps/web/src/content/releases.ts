import type { OrgPage, OrgSettingsPage } from '../lib/dashboard-paths'
import type { ReleaseTag } from '../types/dashboard/inbox'

/** A release note as written here; `lib/release-feed.ts` puts it in an org's What's new. */
export interface ReleaseNote {
  id: string
  tag: ReleaseTag
  /** ISO time it shipped. */
  date: string
  title: string
  body: string
  /** Where "learn more" goes, in the org What's new is open in. */
  link: { label: string; page: OrgPage | { settings: OrgSettingsPage } }
}

/**
 * What's new (B8): hand-written for people using the dashboard — not the
 * commit log — when a release ships something worth telling them. Newest
 * first; a self-hosted instance shows the notes of the version it runs.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'rel_inbox',
    tag: 'new',
    date: '2026-10-30T12:00:00.000Z',
    title: 'An Inbox for what needs you',
    body: 'Edit-access requests, failing workflows, API keys about to expire and answered invites now reach you here. Failures and requests are emailed to you too.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_audit',
    tag: 'new',
    date: '2026-10-30T12:00:00.000Z',
    title: 'Audit log',
    body: 'Owners and admins can see who deleted, shared, locked or deployed what, and from where, for 90 days, and export it as CSV.',
    link: { label: 'Open audit log', page: 'audit' },
  },
  {
    id: 'rel_d1_saves',
    tag: 'fixed',
    date: '2026-10-30T09:00:00.000Z',
    title: 'Large workflows save on Cloudflare D1',
    body: 'Saving a workflow with many files, or syncing a run with many steps, no longer fails on a D1 database.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_sharing',
    tag: 'new',
    date: '2026-10-29T16:00:00.000Z',
    title: 'Share a workflow with every workspace',
    body: 'Share a workflow or function to its project and every workspace in it can use it. Only the workspace it lives in can change it.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_lock',
    tag: 'new',
    date: '2026-10-29T12:00:00.000Z',
    title: 'Deletion lock for projects and workspaces',
    body: 'Turn it on to stop a project or workspace from being deleted by mistake. Locking a project protects every workspace in it.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_variables',
    tag: 'improved',
    date: '2026-10-29T10:00:00.000Z',
    title: 'Variables at every level',
    body: 'Set variables for the organization, a project or a workspace. When a workflow runs, the one closest to it wins.',
    link: { label: 'See your projects', page: 'projects' },
  },
  {
    id: 'rel_keys',
    tag: 'new',
    date: '2026-10-29T08:00:00.000Z',
    title: 'API keys at org, project and workspace level',
    body: 'Pick what a key reaches and exactly which actions it can take. The key is shown once when you create it.',
    link: { label: 'Manage API keys', page: { settings: 'api-keys' } },
  },
  {
    id: 'rel_workspaces',
    tag: 'new',
    date: '2026-10-28T12:00:00.000Z',
    title: 'Workspaces inside projects',
    body: 'Give each team its own workspace with separate people, keys and workflows. Anything set at the project level still reaches every workspace.',
    link: { label: 'See your projects', page: 'projects' },
  },
]
