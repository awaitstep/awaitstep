import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Bell, House, Sparkles } from 'lucide-react'
import { RailAccountButton, RailItem, RailOrgButton, ThemeButton } from './rail-item'

const meta = {
  title: 'Shell/RailItem',
  component: RailItem,
  decorators: [
    (Story) => (
      <div className="flex w-[72px] flex-col items-center gap-1 bg-sidebar py-3">
        <Story />
      </div>
    ),
  ],
  args: { href: '/acme/projects', icon: House, label: 'Projects' },
} satisfies Meta<typeof RailItem>

export default meta

type Story = StoryObj<typeof meta>

export const Plain: Story = {}

export const Active: Story = { args: { active: true } }

export const Dot: Story = {
  args: {
    href: '/acme/whats-new',
    icon: Sparkles,
    label: "What's new",
    badge: { kind: 'dot', description: '2 updates since your last visit' },
  },
}

export const Count: Story = {
  args: {
    href: '/acme/inbox',
    icon: Bell,
    label: 'Inbox',
    badge: { kind: 'count', value: 3, description: '3 unread notifications' },
  },
}

export const CountOverflow: Story = {
  args: {
    href: '/acme/inbox',
    icon: Bell,
    label: 'Inbox',
    badge: { kind: 'count', value: 140, description: '140 unread notifications' },
  },
}

export const ThemeDark: Story = {
  render: () => <ThemeButton theme="dark" onToggle={fn()} />,
}

export const ThemeLight: Story = {
  render: () => <ThemeButton theme="light" onToggle={fn()} />,
}

export const Avatars: Story = {
  render: () => (
    <>
      <RailOrgButton name="Acme Inc" initial="A" />
      <RailAccountButton user={{ name: 'Ama Mensah', email: 'ama@acme.test' }} />
    </>
  ),
}
