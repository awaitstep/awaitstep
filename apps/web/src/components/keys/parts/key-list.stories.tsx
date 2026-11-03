import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ApiKey } from '../../../types/dashboard/api-keys'
import { KeyLevelCards } from './key-level-cards'
import { KeyTable } from './key-table'

// KeysPage: the level cards and a level's key list.
const meta = {
  title: 'Keys/Key list',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const NOW = new Date('2026-10-27T12:00:00.000Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()

const KEYS: ApiKey[] = [
  {
    id: 'k1',
    level: 'project',
    name: 'CI deploys',
    prefix: 'ask_Kq3VtR8m…a71d',
    permissions: { workflows: ['read', 'deploy'], runs: ['read'] },
    createdBy: { id: 'u1', name: 'Tom Becker' },
    createdAt: ago(60 * 24 * 60),
    lastUsedAt: ago(22),
    expiresAt: null,
    workspace: null,
  },
  {
    id: 'k2',
    level: 'project',
    name: 'Agent (Claude)',
    prefix: 'ask_zN8wLc2e…2e07',
    permissions: { workflows: ['read', 'write'], variables: ['read'], runs: ['read'] },
    createdBy: { id: 'u2', name: 'Ama Mensah' },
    createdAt: ago(60 * 48),
    lastUsedAt: ago(180),
    expiresAt: inDays(28),
    workspace: null,
  },
  {
    id: 'k3',
    level: 'project',
    name: 'Read-only dashboard',
    prefix: 'ask_H2pmXd7q…90fa',
    permissions: { workspaces: ['read'], workflows: ['read'], runs: ['read'] },
    createdBy: { id: 'u3', name: 'Lena Ortiz' },
    createdAt: ago(60 * 24 * 30),
    lastUsedAt: null,
    expiresAt: inDays(3),
    workspace: null,
  },
]

const LINKS = {
  organization: { href: '#org-keys', label: 'Org keys' },
  workspace: { href: '#workspace-settings', label: 'In Workspace settings' },
}

function noop() {}

export const ProjectLevel: Story = {
  render: () => (
    <div className="flex max-w-[1200px] flex-col gap-6">
      <KeyLevelCards current="project" links={LINKS} />
      <KeyTable caption="Project keys" keys={KEYS} onRevoke={noop} now={NOW} />
    </div>
  ),
}

export const ReadOnly: Story = {
  render: () => <KeyTable caption="Project keys" keys={KEYS} now={NOW} />,
}

export const Empty: Story = {
  render: () => <KeyTable caption="Project keys" keys={[]} empty="No project keys yet." />,
}

export const Inherited: Story = {
  render: () => <KeyTable caption="Inherited from the project" keys={KEYS} inherited now={NOW} />,
}
