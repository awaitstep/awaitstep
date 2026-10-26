import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Workflow } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ListCard, ListRow } from './list-card'
import { RunHistoryBars } from './run-history-bars'
import { SegmentedFilter, type FilterOption } from './segmented-filter'
import { ShareToggle } from './share-toggle'
import { StatusPill } from './status-pill'
import { Tile } from './tile'
import { SALES_WORKFLOWS, type SampleWorkflow } from './__tests__/fixtures/lists'

// The K3 parts composed as the `Workflows` board draws them, to check side by
// side with it. The page itself (P2) composes the same parts from real hooks.
const meta = {
  title: 'UI/Workflows list',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type Filter = 'all' | 'deployed' | 'draft' | 'failing'

function matches(workflow: SampleWorkflow, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'failing') return workflow.failing
  return workflow.status === filter
}

function tileTone(workflow: SampleWorkflow) {
  if (workflow.failing) return 'fail'
  return workflow.status === 'draft' ? 'neutral' : 'ok'
}

function WorkflowsListDemo({ viewer = false }: { viewer?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [shared, setShared] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SALES_WORKFLOWS.map((workflow) => [workflow.id, workflow.shared])),
  )

  const options: FilterOption<Filter>[] = [
    { id: 'all', label: 'All', count: SALES_WORKFLOWS.length },
    {
      id: 'deployed',
      label: 'Deployed',
      count: SALES_WORKFLOWS.filter((w) => matches(w, 'deployed')).length,
    },
    {
      id: 'draft',
      label: 'Drafts',
      count: SALES_WORKFLOWS.filter((w) => matches(w, 'draft')).length,
    },
    {
      id: 'failing',
      label: 'Failing',
      count: SALES_WORKFLOWS.filter((w) => w.failing).length,
      tone: 'danger',
    },
  ]
  const visible = SALES_WORKFLOWS.filter((workflow) => matches(workflow, filter))

  function shareHandler(id: string) {
    return (next: boolean) => setShared((current) => ({ ...current, [id]: next }))
  }

  return (
    <div className="flex max-w-screen-xl flex-col gap-6">
      <div className="flex justify-end">
        <SegmentedFilter
          label="Filter workflows"
          options={options}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <ListCard label="Workflows in Sales" empty="No workflows match this filter.">
        {visible.map((workflow) => (
          <ListRow
            key={workflow.id}
            leading={
              <Tile tone={tileTone(workflow)}>
                <Workflow />
              </Tile>
            }
            title={workflow.name}
            href={`/workflows/${workflow.id}`}
            description={workflow.description}
            trailing={
              <>
                <span className="w-[130px]">
                  <StatusPill status={workflow.status}>{workflow.statusLabel}</StatusPill>
                </span>
                <span className="flex w-[150px] flex-col gap-1.5">
                  <RunHistoryBars runs={workflow.runs} />
                  <span
                    className={cn(
                      'text-2xs',
                      workflow.failing ? 'text-status-error' : 'text-muted-foreground',
                    )}
                  >
                    {workflow.last}
                  </span>
                </span>
                <span className="w-[120px]">
                  <ShareToggle
                    shared={shared[workflow.id]}
                    onChange={shareHandler(workflow.id)}
                    label={`Share ${workflow.name} with Project 101`}
                    disabledReason={viewer ? "Viewers can't change sharing" : undefined}
                  />
                </span>
              </>
            }
          />
        ))}
      </ListCard>
    </div>
  )
}

export const Editor: Story = { render: () => <WorkflowsListDemo /> }

export const Viewer: Story = { render: () => <WorkflowsListDemo viewer /> }
