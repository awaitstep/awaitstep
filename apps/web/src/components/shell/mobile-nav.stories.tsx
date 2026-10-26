import type { Meta, StoryObj } from '@storybook/react-vite'
import { MobileTabBar } from './mobile-nav'
import {
  OrgMobileHeader,
  SampleTabBar,
  WorkspaceMobileHeader,
  mobileTabs,
} from './__tests__/fixtures/phone'

// The phone frame's parts on their own, at 390 px. Shell/Phone screens puts
// them together as the Mobile* boards draw them.
const meta = {
  title: 'Shell/Phone nav',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'phone', isRotated: false } },
  decorators: [
    (Story) => (
      <div className="min-h-[844px] bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const TabBarProjects: Story = { render: () => <SampleTabBar activeKey="projects" /> }

export const TabBarInbox: Story = { render: () => <SampleTabBar activeKey="inbox" /> }

export const TabBarInboxRead: Story = {
  render: () => (
    <MobileTabBar
      activeKey="audit"
      items={mobileTabs.map((entry) =>
        entry.key === 'inbox'
          ? { ...entry, badge: { kind: 'count', value: 0, description: 'no unread notifications' } }
          : entry,
      )}
    />
  ),
}

export const HeaderOrg: Story = { render: () => <OrgMobileHeader /> }

export const HeaderWorkspace: Story = { render: () => <WorkspaceMobileHeader /> }

export const ProjectMenuOpen: Story = { render: () => <WorkspaceMobileHeader initiallyOpen /> }
