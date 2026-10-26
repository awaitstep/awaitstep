import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReleaseNote } from './release-note'
import { AUDIT_RELEASE, RESOURCES_RELEASE, WORKSPACES_RELEASE } from './__tests__/fixtures/inbox'

// Entries from the WhatsNew board.
const meta = {
  title: 'Inbox/ReleaseNote',
  decorators: [
    (Story) => (
      <div className="flex max-w-[560px] flex-col divide-y divide-border rounded-2xl border border-border bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const EachTag: Story = {
  render: () => (
    <>
      <ReleaseNote release={WORKSPACES_RELEASE} />
      <ReleaseNote release={RESOURCES_RELEASE} />
      <ReleaseNote release={AUDIT_RELEASE} />
    </>
  ),
}
