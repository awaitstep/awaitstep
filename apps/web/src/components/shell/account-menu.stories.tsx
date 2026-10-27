import type { Meta, StoryObj } from '@storybook/react-vite'
import { AccountMenu } from './account-menu'
import { RailAccountButton } from './rail-item'
import { ACCOUNT_GROUPS, AMA, PHONE_GROUP } from './__tests__/fixtures/account'

// The AccountMenu board, opened from the rail's avatar.
const meta = {
  title: 'Shell/AccountMenu',
  decorators: [
    (Story) => (
      <div className="flex h-[420px] items-end p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Desktop: Story = {
  render: () => (
    <AccountMenu
      trigger={<RailAccountButton user={AMA} />}
      user={AMA}
      groups={ACCOUNT_GROUPS}
      defaultOpen
    />
  ),
}

export const Phone: Story = {
  render: () => (
    <AccountMenu
      trigger={<RailAccountButton user={AMA} />}
      user={AMA}
      groups={[ACCOUNT_GROUPS[0]!, PHONE_GROUP, ACCOUNT_GROUPS[1]!]}
      side="top"
      align="start"
      defaultOpen
    />
  ),
}
