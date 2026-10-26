import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { ActionCard } from '../../ui/action-card'
import { WorkspaceCard } from './workspace-card'
import { IT, SALES, SUPPORT } from './__tests__/fixtures/workspaces'

// The project's Workspaces page, from ProjectOverview.
const meta = {
  title: 'Workspaces/WorkspaceCard',
  decorators: [
    (Story) => (
      <div className="grid max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const ProjectWorkspaces: Story = {
  render: () => (
    <>
      <WorkspaceCard workspace={SALES} href="#sales" current />
      <WorkspaceCard workspace={IT} href="#it" />
      <WorkspaceCard workspace={SUPPORT} href="#support" isNew />
      <ActionCard
        href="#new-workspace"
        icon={Plus}
        tone="ok"
        title="New workspace"
        description="Give another team its own people, keys and workflows"
        variant="dashed"
      />
    </>
  ),
}

export const YoureHere: Story = {
  render: () => <WorkspaceCard workspace={SALES} href="#sales" current />,
}

export const Other: Story = {
  render: () => <WorkspaceCard workspace={IT} href="#it" />,
}

export const NewAndEmpty: Story = {
  render: () => <WorkspaceCard workspace={SUPPORT} href="#support" isNew />,
}
