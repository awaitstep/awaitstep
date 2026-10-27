import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'
import {
  OrgSettingsPanel,
  ProjectSettingsPanel,
  SampleRail,
  WorkspacePanel,
} from './__tests__/fixtures/frame'
import { AppShell } from './app-shell'
import { PageBody, PageIntro } from './page-intro'
import { TopBar } from './top-bar'

const meta = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppShell>

export default meta

type Story = StoryObj<typeof meta>

function PagePlaceholder() {
  return (
    <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
      Page content
    </div>
  )
}

const unusedArgs = { rail: null, children: null }

export const Main: Story = {
  args: unusedArgs,
  render: () => (
    <AppShell rail={<SampleRail activeKey="projects" />} panel={<WorkspacePanel />}>
      <TopBar
        breadcrumbs={[{ label: 'Acme Inc' }]}
        actions={
          <Button size="sm">
            <Plus />
            New project
          </Button>
        }
      />
      <PageBody>
        <PageIntro
          title="Projects"
          description="Everything in Acme Inc. Open a project to work in one of its workspaces."
        />
        <PagePlaceholder />
      </PageBody>
    </AppShell>
  ),
}

export const ProjectGeneral: Story = {
  args: unusedArgs,
  render: () => (
    <AppShell
      rail={<SampleRail activeKey="projects" />}
      panel={<ProjectSettingsPanel active="general" />}
    >
      <TopBar
        breadcrumbs={[
          { label: 'Acme Inc', href: '/acme/projects' },
          { label: 'Project 101', href: '/acme/project-101' },
          { label: 'Settings' },
          { label: 'General' },
        ]}
        actions={<Button size="sm">Save changes</Button>}
      />
      <PageBody>
        <PageIntro
          title="General"
          description="Project 101's name and address, and the actions that can't be undone."
        />
        <PagePlaceholder />
      </PageBody>
    </AppShell>
  ),
}

export const OrgMembers: Story = {
  args: unusedArgs,
  render: () => (
    <AppShell
      rail={<SampleRail activeKey="settings" />}
      panel={<OrgSettingsPanel active="members" />}
    >
      <TopBar
        breadcrumbs={[
          { label: 'Acme Inc', href: '/acme/projects' },
          { label: 'Settings' },
          { label: 'Members' },
        ]}
        actions={<Button size="sm">Invite people</Button>}
      />
      <PageBody>
        <PageIntro
          title="Members"
          description="Everyone in Acme Inc and where they can work. Owners and admins see every project."
        />
        <PagePlaceholder />
      </PageBody>
    </AppShell>
  ),
}

export const ResourcesWithoutPanel: Story = {
  args: unusedArgs,
  render: () => (
    <AppShell rail={<SampleRail activeKey="resources" />}>
      <TopBar
        breadcrumbs={[{ label: 'Acme Inc', href: '/acme/projects' }, { label: 'Resources' }]}
      />
      <PageBody>
        <PageIntro
          title="Resources"
          description="Nodes and variables every project in Acme Inc can use."
        />
        <PagePlaceholder />
      </PageBody>
    </AppShell>
  ),
}
