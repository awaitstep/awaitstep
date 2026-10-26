import type { Meta, StoryObj } from '@storybook/react-vite'
import { Code2, Download, FolderClosed, Library, Plug, Users, Workflow } from 'lucide-react'
import { ActionCard } from './action-card'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { ProgressMeter } from './progress-meter'

// Empty scopes: EmptyWorkspace's hero, WsLibrary's empty state, and the
// step / action cards and progress of EmptyOrg and EmptyProject.
const meta = {
  title: 'UI/Empty states',
  decorators: [
    (Story) => (
      <div className="max-w-[1080px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const TodaysDefault: Story = {
  render: () => (
    <EmptyState
      icon={Workflow}
      title="No workflows yet"
      description="Create your first workflow to get started."
      action={<Button size="sm">New workflow</Button>}
    />
  ),
}

function FannedTiles() {
  return (
    <span aria-hidden="true" className="flex items-center">
      <span className="flex size-12 -rotate-[8deg] items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        <Code2 className="size-5" />
      </span>
      <span className="relative -mx-1.5 flex size-[60px] items-center justify-center rounded-2xl border border-status-success/40 bg-tone-ok text-status-success">
        <Workflow className="size-6" />
      </span>
      <span className="flex size-12 rotate-[8deg] items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
        <Download className="size-5" />
      </span>
    </span>
  )
}

export const WorkspaceHero: Story = {
  render: () => (
    <EmptyState
      icon={<FannedTiles />}
      size="lg"
      tone="welcome"
      headingLevel={1}
      title="Nothing in Support yet"
      description="Only people with access to Support will see what you build here. Share it later if another workspace should call it."
      actions={
        <>
          <Button>New workflow</Button>
          <Button variant="outline">New function</Button>
          <Button variant="outline">Import</Button>
        </>
      }
    />
  ),
}

export const LibraryEmpty: Story = {
  render: () => (
    <EmptyState
      icon={Library}
      headingLevel={2}
      title="No modules or resources yet"
      description="Modules and resource nodes Sales builds with will show here, with what Project 101 shares."
    />
  ),
}

export const ProjectActionCards: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      <ActionCard
        href="#"
        icon={Workflow}
        tone="ok"
        title="New workflow"
        description="Durable steps that retry, wait and resume"
        cta="Start building"
        highlighted
      />
      <ActionCard
        href="#"
        icon={Code2}
        tone="info"
        title="New function"
        description="A plain request handler, no steps"
        cta="Create function"
      />
      <ActionCard
        href="#"
        icon={Download}
        tone="warn"
        title="Import"
        description="Bring in a workflow file you exported"
        cta="Choose a file"
      />
    </div>
  ),
}

export const OrgSteps: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Get Acme Inc ready</h2>
        <ProgressMeter done={0} total={3} label="Get Acme Inc ready" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <ActionCard
          href="#"
          icon={FolderClosed}
          tone="ok"
          title="Create a project"
          description="Where your workflows will live"
          corner="Step 1"
          highlighted
        />
        <ActionCard
          href="#"
          icon={Plug}
          tone="warn"
          title="Connect Cloudflare"
          description="Needed to deploy. You can build first"
          corner="Step 2"
        />
        <ActionCard
          href="#"
          icon={Users}
          tone="info"
          title="Invite your team"
          description="Choose which projects each person sees"
          corner="Optional"
        />
      </div>
    </div>
  ),
}

export const Progress: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <ProgressMeter done={0} total={3} label="Set up Billing" />
      <ProgressMeter done={1} total={3} label="Set up Billing" />
      <ProgressMeter done={3} total={3} label="Set up Billing" />
    </div>
  ),
}
