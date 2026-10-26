import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type DataColumn } from '../data-table'
import { Pager } from '../pager'
import { SALES_RUNS, type SampleRun } from './fixtures/lists'

const COLUMNS: DataColumn<SampleRun>[] = [
  { id: 'workflow', header: 'Workflow', cell: (run) => run.workflow },
  { id: 'run', header: 'Run', cell: (run) => run.id },
  { id: 'took', header: 'Took', align: 'right', cell: (run) => run.took },
]

describe('DataTable', () => {
  it('is a table named by its caption, with column headers and one row per item', () => {
    render(
      <DataTable
        caption="Runs in Sales"
        columns={COLUMNS}
        rows={SALES_RUNS}
        getRowKey={(run) => run.id}
      />,
    )
    const table = screen.getByRole('table', { name: 'Runs in Sales' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Workflow', 'Run', 'Took'])
    // Header row plus one per run.
    expect(within(table).getAllByRole('row')).toHaveLength(SALES_RUNS.length + 1)
    expect(within(table).getByRole('cell', { name: 'run_8f2c' })).toBeInTheDocument()
  })

  it('shows its empty message across all columns when there are no rows', () => {
    render(
      <DataTable
        caption="Runs in Support"
        columns={COLUMNS}
        rows={[]}
        getRowKey={(run) => run.id}
        empty="No runs in Support yet."
      />,
    )
    const cell = screen.getByRole('cell', { name: 'No runs in Support yet.' })
    expect(cell).toHaveAttribute('colspan', '3')
  })
})

describe('Pager', () => {
  it('disables Newer on the first page and Older on the last', () => {
    const { rerender } = render(
      <Pager summary="First" hasNewer={false} hasOlder onNewer={vi.fn()} onOlder={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Older' })).toBeEnabled()
    rerender(<Pager summary="Last" hasNewer hasOlder={false} onNewer={vi.fn()} onOlder={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Newer' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled()
  })

  it('is a labelled navigation region whose buttons fire their callbacks', async () => {
    const onNewer = vi.fn()
    const onOlder = vi.fn()
    render(
      <Pager
        label="Runs pages"
        summary="Showing 8 of 128"
        hasNewer
        hasOlder
        onNewer={onNewer}
        onOlder={onOlder}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Runs pages' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Newer' }))
    await userEvent.click(within(nav).getByRole('button', { name: 'Older' }))
    expect(onNewer).toHaveBeenCalledOnce()
    expect(onOlder).toHaveBeenCalledOnce()
  })
})
