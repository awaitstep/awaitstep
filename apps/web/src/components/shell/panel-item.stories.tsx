import type { Meta, StoryObj } from '@storybook/react-vite'
import { BookOpen, Braces, KeyRound, Settings, Users, Workflow } from 'lucide-react'
import { PanelItem, PanelSection } from './panel-item'

const meta = {
  title: 'Shell/PanelItem',
  component: PanelItem,
  decorators: [
    (Story) => (
      <div className="w-[232px] bg-sidebar p-2.5">
        <Story />
      </div>
    ),
  ],
  args: { href: '/acme/project-101/sales/workflows', icon: Workflow, label: 'Workflows' },
} satisfies Meta<typeof PanelItem>

export default meta

type Story = StoryObj<typeof meta>

export const Inactive: Story = {}

export const Active: Story = { args: { active: true } }

export const WithBadge: Story = {
  args: { badge: <span className="text-2xs text-muted-foreground">4</span> },
}

export const External: Story = {
  args: { href: 'https://docs.awaitstep.dev', icon: BookOpen, label: 'Docs', external: true },
}

export const CaptionedSection: Story = {
  render: () => (
    <PanelSection title="Workspace">
      <PanelItem href="#" icon={Users} label="Members" />
      <PanelItem href="#" icon={KeyRound} label="API keys" active />
      <PanelItem href="#" icon={Braces} label="Variables" />
      <PanelItem href="#" icon={Settings} label="General" />
    </PanelSection>
  ),
}
