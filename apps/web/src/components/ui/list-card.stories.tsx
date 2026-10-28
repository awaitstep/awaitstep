import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleAlert, Monitor, Share2, Upload, Workflow } from 'lucide-react'
import { Badge } from './badge'
import { Button } from './button'
import { ListCard, ListRow } from './list-card'
import { SectionHeader } from './section-header'
import { StatusPill } from './status-pill'
import { Tile } from './tile'
import { SALES_WORKFLOWS } from './__tests__/fixtures/lists'

const meta = {
  title: 'UI/ListCard',
  component: ListCard,
} satisfies Meta<typeof ListCard>

export default meta

type Story = StoryObj<typeof meta>

export const WorkflowRows: Story = {
  render: () => (
    <ListCard label="Workflows in Sales">
      {SALES_WORKFLOWS.map((workflow) => (
        <ListRow
          key={workflow.id}
          leading={
            <Tile tone={workflow.failing ? 'fail' : workflow.status === 'draft' ? 'neutral' : 'ok'}>
              <Workflow />
            </Tile>
          }
          title={workflow.name}
          href={`/workflows/${workflow.id}`}
          description={workflow.description}
          trailing={<StatusPill status={workflow.status}>{workflow.statusLabel}</StatusPill>}
        />
      ))}
    </ListCard>
  ),
}

const ACTIVITY = [
  {
    id: 'a1',
    icon: CircleAlert,
    tone: 'fail',
    title: 'Lead enrichment failed at step "Fetch company"',
    where: 'Project 101 · Sales',
    status: 'failed',
    when: '5m ago',
  },
  {
    id: 'a2',
    icon: Upload,
    tone: 'ok',
    title: 'Provision account deployed as v7',
    where: 'Project 101 · IT',
    status: 'deployed',
    when: '1h ago',
  },
  {
    id: 'a3',
    icon: Share2,
    tone: 'info',
    title: 'Send Slack alert shared to Project 101',
    where: 'Project 101 · IT',
    status: 'shared',
    when: '3h ago',
  },
] as const

export const ActivityRows: Story = {
  render: () => (
    <section className="flex flex-col gap-3.5">
      <SectionHeader title="Recent activity" caption="Across every project" />
      <ListCard>
        {ACTIVITY.map((item) => (
          <ListRow
            key={item.id}
            leading={
              <Tile tone={item.tone} size="sm">
                <item.icon />
              </Tile>
            }
            title={item.title}
            href="/acme/project-101/sales/runs"
            description={item.where}
            trailing={
              <>
                <StatusPill status={item.status} />
                <span className="w-16 text-right text-2xs text-muted-foreground">{item.when}</span>
              </>
            }
          />
        ))}
      </ListCard>
    </section>
  ),
}

/** A pill beside the title (`AccountSessions`). */
export const TitleBadge: Story = {
  render: () => (
    <ListCard label="Active sessions">
      <ListRow
        leading={
          <Tile tone="ok">
            <Monitor />
          </Tile>
        }
        title="Chrome on macOS"
        badge={<Badge variant="success">This device</Badge>}
        description="81.2.69.x · signed in 3 days ago"
        trailing={<span className="text-2xs text-muted-foreground">Active now</span>}
      />
    </ListCard>
  ),
}

export const Empty: Story = {
  render: () => <ListCard label="Functions in Support" empty="No functions in Support yet." />,
}

export const SectionHeaders: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Workspaces" />
      <SectionHeader
        title="Shared with Sales"
        caption="From other workspaces in Project 101 · read-only here"
      />
      <SectionHeader
        title="Project keys"
        caption="Work in every workspace"
        action={<Button size="sm">Create key</Button>}
      />
    </div>
  ),
}
