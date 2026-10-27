import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { ListCard, ListRow } from '../ui/list-card'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { StatusPill } from '../ui/status-pill'
import { AppShell } from './app-shell'
import { PageBody, PageIntro } from './page-intro'
import { SampleRail, WorkspacePanel } from './__tests__/fixtures/frame'
import { SampleTabBar, WorkspaceMobileHeader } from './__tests__/fixtures/phone'
import { SALES_WORKFLOWS } from '../ui/__tests__/fixtures/lists'

// The phone frame composed as MobileWorkflows and MobileMenu draw it.
// Temporary: P2 deletes these (and the file); MobileProjects went with P1.
// See "Temporary composite stories" in plan/workspaces-w1.md.
const meta = {
  title: 'Shell/Phone screens',
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'phone', isRotated: false } },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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

export const MobileWorkflows: Story = { render: () => <MobileWorkflowsScreen /> }

export const MobileMenu: Story = { render: () => <MobileWorkflowsScreen menuOpen /> }
