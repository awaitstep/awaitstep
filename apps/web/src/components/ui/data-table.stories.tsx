import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { DataTable, type DataColumn } from './data-table'
import { Pager } from './pager'
import { StatusPill } from './status-pill'
import { PEOPLE, SALES_RUNS, type SampleRun } from './__tests__/fixtures/lists'

const meta = {
  title: 'UI/DataTable',
  component: DataTable,
} satisfies Meta<typeof DataTable>

export default meta

type Story = StoryObj<typeof meta>

const RUN_COLUMNS: DataColumn<SampleRun>[] = [
  {
    id: 'result',
    header: 'Result',
    width: '140px',
    cell: (run) => <StatusPill status={run.result} />,
  },
  {
    id: 'workflow',
    header: 'Workflow',
    cell: (run) => (
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{run.workflow}</span>
        <span className="text-2xs text-muted-foreground">{run.kind}</span>
      </span>
    ),
  },
  {
    id: 'run',
    header: 'Run',
    width: '120px',
    cell: (run) => <span className="text-muted-foreground">{run.id}</span>,
  },
  {
    id: 'trigger',
    header: 'Trigger',
    width: '110px',
    cell: (run) => <span className="text-muted-foreground">{run.trigger}</span>,
  },
  {
    id: 'started',
    header: 'Started',
    width: '110px',
    cell: (run) => <span className="text-muted-foreground">{run.started}</span>,
  },
  {
    id: 'took',
    header: 'Took',
    width: '80px',
    align: 'right',
    cell: (run) => <span className="text-muted-foreground">{run.took}</span>,
  },
]

const PAGES = [SALES_RUNS, SALES_RUNS.slice(0, 5).map((run) => ({ ...run, id: `${run.id}_p2` }))]

function RunsDemo() {
  const [page, setPage] = useState(0)

  function handleNewer() {
    setPage((current) => current - 1)
  }

  function handleOlder() {
    setPage((current) => current + 1)
  }

  return (
    <DataTable
      caption="Runs in Sales"
      columns={RUN_COLUMNS}
      rows={PAGES[page]}
      getRowKey={(run) => run.id}
      footer={
        <Pager
          label="Runs pages"
          summary={`Showing ${PAGES[page].length} of 128 runs in the last 24 hours`}
          hasNewer={page > 0}
          hasOlder={page < PAGES.length - 1}
          onNewer={handleNewer}
          onOlder={handleOlder}
        />
      }
    />
  )
}

export const Runs: Story = {
  args: { caption: '', columns: [], rows: [], getRowKey: () => '' },
  render: () => <RunsDemo />,
}

interface Member {
  name: string
  role: string
  joined: string
}

const MEMBERS: Member[] = PEOPLE.map((person, i) => ({
  name: person.name,
  role: i === 0 ? 'Owner' : i < 2 ? 'Admin' : 'Member',
  joined: `${3 + i} Sep`,
}))

const MEMBER_COLUMNS: DataColumn<Member>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (member) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={member.name} />
        {member.name}
      </span>
    ),
  },
  { id: 'role', header: 'Role', width: '140px', cell: (member) => <Badge>{member.role}</Badge> },
  { id: 'joined', header: 'Joined', width: '120px', cell: (member) => member.joined },
]

export const Members: Story = {
  args: {
    caption: 'Members of Acme Inc',
    columns: MEMBER_COLUMNS as DataColumn<unknown>[],
    rows: MEMBERS,
    getRowKey: (member) => (member as Member).name,
    minWidth: '520px',
  },
}

export const Empty: Story = {
  args: {
    caption: 'Runs in Support',
    columns: RUN_COLUMNS as DataColumn<unknown>[],
    rows: [],
    getRowKey: () => '',
    empty: 'No runs in Support yet.',
  },
}

export const PagerStates: Story = {
  args: { caption: '', columns: [], rows: [], getRowKey: () => '' },
  render: () => (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card">
      <Pager
        summary="Showing 25 of 128 · first page"
        hasNewer={false}
        hasOlder
        onNewer={fn()}
        onOlder={fn()}
      />
      <Pager summary="Showing 25 of 128 · middle" hasNewer hasOlder onNewer={fn()} onOlder={fn()} />
      <Pager
        summary="Showing 3 of 128 · last page"
        hasNewer
        hasOlder={false}
        onNewer={fn()}
        onOlder={fn()}
      />
    </div>
  ),
}
