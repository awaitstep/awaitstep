import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DataTable } from '../data-table'
import { ListCard, ListRow } from '../list-card'
import { ScopedSection } from '../scoped-section'
import { PROJECT_KEYS, SALES_MEMBERS } from './fixtures/access'
import { KeyTable, MemberList } from './fixtures/access-rows'

const MANAGE = { label: 'Manage in Project settings', href: '/acme/project-101/settings' }

describe('ScopedSection', () => {
  it('is a region named by its scope label', () => {
    render(
      <ScopedSection kind="own" scopeLabel="Only in Sales" colour="green" hint="Reach Sales only">
        <MemberList members={SALES_MEMBERS} />
      </ScopedSection>,
    )
    const region = screen.getByRole('region', { name: 'Only in Sales' })
    expect(within(region).getByRole('list', { name: 'Members' })).toBeInTheDocument()
    expect(within(region).getByText('Reach Sales only')).toBeInTheDocument()
    expect(within(region).queryByRole('link')).not.toBeInTheDocument()
  })

  it('draws an inherited section dashed, with a link to where it is managed', () => {
    render(
      <ScopedSection kind="inherited" scopeLabel="From Project 101" manage={MANAGE}>
        <KeyTable keys={PROJECT_KEYS} inherited />
      </ScopedSection>,
    )
    const region = screen.getByRole('region', { name: 'From Project 101' })
    expect(region).toHaveClass('border-dashed')
    expect(
      within(region).getByRole('link', { name: 'Manage in Project settings' }),
    ).toHaveAttribute('href', MANAGE.href)
    expect(within(region).getByRole('cell', { name: 'Inherited' })).toBeInTheDocument()
    expect(within(region).queryByRole('button', { name: /Revoke/ })).not.toBeInTheDocument()
  })
})

describe('framed', () => {
  it('drops the card border from ListCard and DataTable when false', () => {
    const { container } = render(
      <>
        <ListCard framed={false} label="Rows">
          <ListRow title="Lead enrichment" />
        </ListCard>
        <DataTable
          framed={false}
          caption="Runs"
          columns={[{ id: 'name', header: 'Name', cell: (row: { id: string }) => row.id }]}
          rows={[{ id: 'run-1' }]}
          getRowKey={(row) => row.id}
        />
      </>,
    )
    expect(container.querySelectorAll('.rounded-2xl')).toHaveLength(0)
  })

  it('keeps the card border by default', () => {
    const { container } = render(
      <ListCard label="Rows">
        <ListRow title="Lead enrichment" />
      </ListCard>,
    )
    expect(container.firstElementChild).toHaveClass('rounded-2xl', 'border')
  })
})
