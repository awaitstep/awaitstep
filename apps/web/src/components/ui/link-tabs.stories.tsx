import type { Meta, StoryObj } from '@storybook/react-vite'
import { LinkTabs } from './link-tabs'

// The account pages' tabs (`AccountProfile`, `AccountSessions`).
const meta = {
  title: 'UI/Link tabs',
  component: LinkTabs,
} satisfies Meta<typeof LinkTabs>

export default meta

type Story = StoryObj<typeof meta>

export const Account: Story = {
  args: {
    label: 'Account sections',
    activeKey: 'profile',
    tabs: [
      { key: 'profile', label: 'Profile', href: '#profile' },
      { key: 'sessions', label: 'Sessions and sign-in', href: '#sessions' },
    ],
  },
}
