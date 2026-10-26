import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { TopBar } from './top-bar'

const meta = {
  title: 'Shell/TopBar',
  component: TopBar,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TopBar>

export default meta

type Story = StoryObj<typeof meta>

export const OrgOnly: Story = {
  args: { breadcrumbs: [{ label: 'Acme Inc' }] },
}

export const DeepPath: Story = {
  args: {
    breadcrumbs: [
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Project 101', href: '/acme/project-101' },
      { label: 'Settings' },
      { label: 'General' },
    ],
  },
}

export const WithActions: Story = {
  args: {
    breadcrumbs: [
      { label: 'Acme Inc', href: '/acme/projects' },
      { label: 'Settings' },
      { label: 'Members' },
    ],
    actions: <Button size="sm">Invite people</Button>,
  },
}

export const WithSlotAndAction: Story = {
  args: {
    breadcrumbs: [{ label: 'Acme Inc' }],
    children: (
      <div className="flex h-9 min-w-[280px] items-center rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground">
        Search slot (K3)
      </div>
    ),
    actions: (
      <Button size="sm">
        <Plus />
        New project
      </Button>
    ),
  },
}
