import type { Meta, StoryObj } from '@storybook/react-vite'
import { Braces, Share2, Users } from 'lucide-react'
import { AvatarStack } from '../../ui/avatar-stack'
import { Badge } from '../../ui/badge'
import { ScopeChip } from '../../ui/workspace-dot'
import { ProjectPoolCard } from './project-pool-card'

// The "Project pool" row on ProjectOverview.
const meta = {
  title: 'Project settings/ProjectPoolCard',
  decorators: [
    (Story) => (
      <div className="grid max-w-[1100px] grid-cols-1 gap-4 md:grid-cols-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const ADMINS = [
  { id: 'usr_ama', name: 'Ama Mensah', email: 'ama@acme.test', initials: 'AM' },
  { id: 'usr_tom', name: 'Tom Becker', email: 'tom@acme.test', initials: 'TB' },
]

export const ProjectPool: Story = {
  render: () => (
    <>
      <ProjectPoolCard
        href="#members"
        icon={Users}
        tone="info"
        title="Members & keys"
        count={2}
        caption="admins can open every workspace"
      >
        <span className="flex items-center gap-2.5">
          <AvatarStack people={ADMINS} />
          <Badge className="font-normal">1 project key</Badge>
        </span>
      </ProjectPoolCard>
      <ProjectPoolCard
        href="#variables"
        icon={Braces}
        tone="warn"
        title="Variables"
        count={5}
        caption="2 project · 3 from Acme Inc"
      >
        <span className="flex flex-wrap gap-1.5">
          <Badge className="rounded-md font-mono font-normal">SLACK_TOKEN</Badge>
          <Badge className="rounded-md font-mono font-normal">CRM_BASE_URL</Badge>
          <Badge className="font-normal text-muted-foreground">+3</Badge>
        </span>
      </ProjectPoolCard>
      <ProjectPoolCard
        href="#shared"
        icon={Share2}
        tone="ok"
        title="Shared library"
        count={3}
        caption="items any workspace can use"
      >
        <span className="flex flex-wrap gap-1.5">
          <ScopeChip colour="green">Lead enrichment · Sales</ScopeChip>
          <ScopeChip colour="blue">Provision account · IT</ScopeChip>
          <Badge className="font-normal text-muted-foreground">+1</Badge>
        </span>
      </ProjectPoolCard>
    </>
  ),
}
