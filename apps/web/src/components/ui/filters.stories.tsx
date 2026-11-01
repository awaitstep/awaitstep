import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SearchField } from './search-field'
import { SegmentedFilter, type FilterOption } from './segmented-filter'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

// Controls that narrow or switch what a page shows: filter pills, tabs, search.
const meta = {
  title: 'UI/Filters',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

type WorkflowFilter = 'all' | 'deployed' | 'draft' | 'failing'

const WORKFLOW_FILTERS: FilterOption<WorkflowFilter>[] = [
  { id: 'all', label: 'All', count: 4 },
  { id: 'deployed', label: 'Deployed', count: 3 },
  { id: 'draft', label: 'Drafts', count: 1 },
  { id: 'failing', label: 'Failing', count: 1, tone: 'danger' },
]

function WorkflowFilterDemo() {
  const [value, setValue] = useState<WorkflowFilter>('all')
  return (
    <SegmentedFilter
      label="Filter workflows"
      options={WORKFLOW_FILTERS}
      value={value}
      onChange={setValue}
    />
  )
}

export const WorkflowsFilter: Story = { render: () => <WorkflowFilterDemo /> }

type RunFilter = 'all' | 'failed' | 'running' | 'succeeded'

const RUN_FILTERS: FilterOption<RunFilter>[] = [
  { id: 'all', label: 'All', count: 8 },
  { id: 'failed', label: 'Failed', count: 2, tone: 'danger' },
  { id: 'running', label: 'Running', count: 1 },
  { id: 'succeeded', label: 'Succeeded', count: 5 },
]

function RunsToolbarDemo() {
  const [value, setValue] = useState<RunFilter>('failed')
  const [query, setQuery] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <SegmentedFilter label="Result" options={RUN_FILTERS} value={value} onChange={setValue} />
      <div className="min-w-[220px] flex-1">
        <SearchField
          label="Search runs"
          placeholder="Search by workflow or run ID"
          value={query}
          onChange={setQuery}
        />
      </div>
    </div>
  )
}

export const RunsToolbar: Story = { render: () => <RunsToolbarDemo /> }

function OrgSearchDemo() {
  const [query, setQuery] = useState('')
  return (
    <div className="w-[320px]">
      <SearchField
        label="Search Acme Inc"
        placeholder="Search projects, workspaces, workflows"
        value={query}
        onChange={setQuery}
        shortcut={{ hint: '⌘K', keys: 'Meta+K' }}
      />
    </div>
  )
}

export const SearchWithShortcut: Story = { render: () => <OrgSearchDemo /> }

export const AccessTabs: Story = {
  render: () => (
    <Tabs defaultValue="members">
      <TabsList aria-label="Workspace settings">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="keys">API keys</TabsTrigger>
        <TabsTrigger value="variables">Variables</TabsTrigger>
      </TabsList>
      <TabsContent value="general">Name, colour and the deletion lock.</TabsContent>
      <TabsContent value="members">Only in Sales, then From Project 101.</TabsContent>
      <TabsContent value="keys">Workspace keys, then project keys that work in Sales.</TabsContent>
      <TabsContent value="variables">Sales variables, then inherited ones.</TabsContent>
    </Tabs>
  ),
}
