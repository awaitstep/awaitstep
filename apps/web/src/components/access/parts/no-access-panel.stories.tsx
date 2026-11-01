import type { Meta, StoryObj } from '@storybook/react-vite'
import { NoAccessPanel } from './no-access-panel'
import { GIVERS } from './__tests__/fixtures/givers'

// The AuditLog board's Member view.
const meta = {
  title: 'Access/NoAccessPanel',
  component: NoAccessPanel,
  args: {
    title: 'You can’t see the audit log',
    why: 'It lists sign-ins, API keys and access changes for everyone in Acme Inc, so it’s kept to owners and admins.',
    orgName: 'Acme Inc',
    viewerRole: 'member',
    givers: GIVERS,
    backHref: '/acme/projects',
  },
} satisfies Meta<typeof NoAccessPanel>

export default meta

type Story = StoryObj<typeof meta>

export const Member: Story = {}

export const WhileTheNamesLoad: Story = { args: { givers: undefined } }
