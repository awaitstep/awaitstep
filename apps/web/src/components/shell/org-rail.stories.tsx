import type { Meta, StoryObj } from '@storybook/react-vite'
import { SampleRail } from './__tests__/fixtures/frame'

const meta = {
  title: 'Shell/OrgRail',
  component: SampleRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-[900px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SampleRail>

export default meta

type Story = StoryObj<typeof meta>

export const Projects: Story = { args: { activeKey: 'projects' } }
export const Resources: Story = { args: { activeKey: 'resources' } }
export const AuditLog: Story = { args: { activeKey: 'audit' } }
export const Settings: Story = { args: { activeKey: 'settings' } }
export const WhatsNew: Story = { args: { activeKey: 'whats-new' } }
export const Inbox: Story = { args: { activeKey: 'inbox' } }
export const Api: Story = { args: { activeKey: 'api' } }
