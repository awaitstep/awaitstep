import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { ActionCard } from '../../ui/action-card'
import { ProjectCard } from './project-card'
import { MARKETING_SITE, NEW_PROJECT, PROJECT_101 } from './__tests__/fixtures/projects'

// The org home's project cards, from Main.
const meta = {
  title: 'Projects/ProjectCard',
  decorators: [
    (Story) => (
      <div className="grid max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const OrgHome: Story = {
  render: () => (
    <>
      <ProjectCard project={PROJECT_101} href="#project-101" current />
      <ProjectCard project={MARKETING_SITE} href="#marketing-site" />
      <ProjectCard project={NEW_PROJECT} href="#billing" />
      <ActionCard
        href="#new-project"
        icon={Plus}
        tone="ok"
        title="New project"
        description="Starts with a Default workspace. Add more when teams need their own space."
        variant="dashed"
      />
    </>
  ),
}

export const CurrentWithAFailure: Story = {
  render: () => <ProjectCard project={PROJECT_101} href="#project-101" current />,
}

export const AllPassing: Story = {
  render: () => <ProjectCard project={MARKETING_SITE} href="#marketing-site" />,
}

export const NoRunsYet: Story = {
  render: () => <ProjectCard project={NEW_PROJECT} href="#billing" />,
}
