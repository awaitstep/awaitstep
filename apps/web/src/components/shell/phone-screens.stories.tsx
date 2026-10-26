import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { Button } from '../ui/button'
import { ListCard, ListRow } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { StatusPill } from '../ui/status-pill'
import { WorkspaceDot } from '../ui/workspace-dot'
import { AppShell } from './app-shell'
import { PageBody, PageIntro } from './page-intro'
import { SampleRail, WorkspacePanel } from './__tests__/fixtures/frame'
import { OrgMobileHeader, SampleTabBar, WorkspaceMobileHeader } from './__tests__/fixtures/phone'
import { SALES_WORKFLOWS } from '../ui/__tests__/fixtures/lists'

// The phone frame composed as MobileProjects, MobileWorkflows and MobileMenu
// draw it. Temporary: P1 deletes MobileProjects and P2 the rest (and the
// file), see "Temporary composite stories" in plan/workspaces-w1.md.
const meta = {
  title: 'Shell/Phone screens',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'phone', isRotated: false } },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const PROJECTS = [
  {
    slug: 'project-101',
    name: 'Project 101',
    description: 'Sales and IT automations',
    workspaces: [
      { name: 'Sales', colour: 'green' },
      { name: 'IT', colour: 'blue' },
      { name: 'Support', colour: 'amber' },
    ],
    summary: '8 workflows · 1 failing',
  },
  {
    slug: 'marketing-site',
    name: 'Marketing Site',
    description: 'Forms, newsletters, CMS hooks',
    workspaces: [{ name: 'Default', colour: 'green' }],
    summary: '4 workflows · all passing',
  },
  {
    slug: 'internal-tools',
    name: 'Internal Tools',
    description: 'Back-office jobs',
    workspaces: [{ name: 'Default', colour: 'green' }],
    summary: '7 workflows · all passing',
  },
] as const

function MobileProjectsScreen() {
  return (
    <AppShell
      rail={<SampleRail activeKey="projects" />}
      mobileHeader={<OrgMobileHeader />}
      tabBar={<SampleTabBar />}
    >
      <PageBody>
        <PageIntro
          title="Projects"
          aside={
            <Button size="sm">
              <Plus aria-hidden="true" />
              New
            </Button>
          }
        />
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground">
          <Search size={16} aria-hidden="true" />
          <input
            placeholder="Search projects"
            aria-label="Search projects"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <ListCard label="Projects">
          {PROJECTS.map((project) => (
            <ListRow
              key={project.slug}
              title={project.name}
              href={`/acme/${project.slug}`}
              description={
                <span className="flex flex-col gap-2">
                  {project.description}
                  <span className="flex flex-wrap gap-2.5">
                    {project.workspaces.map((workspace) => (
                      <span key={workspace.name} className="flex items-center gap-1.5">
                        <WorkspaceDot colour={workspace.colour} />
                        {workspace.name}
                      </span>
                    ))}
                  </span>
                  {project.summary}
                </span>
              }
              trailing={
                <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
              }
            />
          ))}
        </ListCard>
      </PageBody>
    </AppShell>
  )
}

type Filter = 'all' | 'deployed' | 'draft' | 'failing'

function MobileWorkflowsScreen({ menuOpen = false }: { menuOpen?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const options: FilterOption<Filter>[] = [
    { id: 'all', label: 'All', count: 4 },
    { id: 'deployed', label: 'Deployed', count: 3 },
    { id: 'draft', label: 'Drafts', count: 1 },
    { id: 'failing', label: 'Failing', count: 1, tone: 'danger' },
  ]
  return (
    <AppShell
      rail={<SampleRail activeKey="projects" />}
      panel={<WorkspacePanel active="workflows" />}
      mobileHeader={<WorkspaceMobileHeader initiallyOpen={menuOpen} />}
      tabBar={<SampleTabBar />}
    >
      <PageBody>
        <PageIntro
          title="Workflows"
          aside={
            <Button size="sm">
              <Plus aria-hidden="true" />
              New
            </Button>
          }
        />
        <SegmentedFilter
          label="Filter workflows"
          options={options}
          value={filter}
          onChange={setFilter}
        />
        <ListCard label="Workflows in Sales">
          {SALES_WORKFLOWS.map((workflow) => (
            <ListRow
              key={workflow.id}
              title={workflow.name}
              href={`/workflows/${workflow.id}`}
              description={workflow.last}
              trailing={<StatusPill status={workflow.status}>{workflow.statusLabel}</StatusPill>}
            />
          ))}
        </ListCard>
        <p className="text-2xs leading-relaxed text-muted-foreground">
          Editing a workflow&apos;s graph needs a bigger screen. On a phone you can read runs,
          retry, and deploy or roll back.
        </p>
      </PageBody>
    </AppShell>
  )
}

export const MobileProjects: Story = { render: () => <MobileProjectsScreen /> }

export const MobileWorkflows: Story = { render: () => <MobileWorkflowsScreen /> }

export const MobileMenu: Story = { render: () => <MobileWorkflowsScreen menuOpen /> }
