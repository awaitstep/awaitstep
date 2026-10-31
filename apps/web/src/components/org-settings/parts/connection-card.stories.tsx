import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Connection } from '../../../types/dashboard/org-settings'
import { ConnectionCard } from './connection-card'

// OrgConnections: one card per Cloudflare account.
const meta = {
  title: 'Org settings/ConnectionCard',
  decorators: [
    (Story) => (
      <div className="flex max-w-[960px] flex-col gap-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const NOW = new Date('2026-10-27T12:00:00.000Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

const PRODUCTION: Connection = {
  id: 'c1',
  name: 'Acme production',
  accountSuffix: '7f2a',
  addedBy: { id: 'u1', name: 'Ama Mensah' },
  tokenStatus: 'active',
  tokenExpiresAt: null,
  hiddenProjects: 0,
  projects: [
    { id: 'p1', name: 'Project 101' },
    { id: 'p2', name: 'Internal Tools' },
  ],
  deployments: { count: 18, lastAt: ago(22) },
}

const SANDBOX: Connection = {
  ...PRODUCTION,
  id: 'c2',
  name: 'Marketing sandbox',
  accountSuffix: '19c0',
  addedBy: { id: 'u2', name: 'Lena Ortiz' },
  tokenExpiresAt: new Date(NOW.getTime() + 6 * 86_400_000).toISOString(),
  projects: [{ id: 'p3', name: 'Marketing Site' }],
  deployments: { count: 4, lastAt: ago(180) },
}

function noop() {}

const ACTIONS = {
  onAddProject: noop,
  onRemoveProject: noop,
  onReplaceToken: noop,
  onRename: noop,
  onRemove: noop,
}

const ADDABLE = [{ id: 'p3', name: 'Marketing Site' }]

export const OrgConnections: Story = {
  render: () => (
    <>
      <ConnectionCard connection={PRODUCTION} addable={ADDABLE} actions={ACTIONS} now={NOW} />
      <ConnectionCard connection={SANDBOX} addable={[]} actions={ACTIONS} now={NOW} />
    </>
  ),
}

export const ReadOnly: Story = {
  render: () => <ConnectionCard connection={PRODUCTION} addable={[]} now={NOW} />,
}

export const AllProjects: Story = {
  render: () => (
    <ConnectionCard
      connection={{ ...PRODUCTION, projects: 'all', deployments: { count: 0, lastAt: null } }}
      addable={[]}
      actions={ACTIONS}
      now={NOW}
    />
  ),
}

export const TokenStates: Story = {
  render: () => (
    <>
      <ConnectionCard
        connection={{ ...PRODUCTION, name: 'Revoked in Cloudflare', tokenStatus: 'invalid' }}
        addable={[]}
        actions={ACTIONS}
        now={NOW}
      />
      <ConnectionCard
        connection={{ ...PRODUCTION, name: 'Added before checks', tokenStatus: 'unchecked' }}
        addable={[]}
        actions={ACTIONS}
        now={NOW}
      />
    </>
  ),
}

/** A member who can't see every project on the list: the rest are counted. */
export const HiddenProjects: Story = {
  render: () => (
    <ConnectionCard
      connection={{
        ...PRODUCTION,
        projects: [{ id: 'p1', name: 'Project 101' }],
        hiddenProjects: 2,
      }}
      addable={[]}
      now={NOW}
    />
  ),
}
