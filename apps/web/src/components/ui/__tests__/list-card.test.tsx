import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ListCard, ListRow } from '../list-card'
import { SectionHeader } from '../section-header'

describe('ListCard', () => {
  it('is a labelled list with one item per row', () => {
    render(
      <ListCard label="Workflows in Sales">
        <ListRow title="Lead enrichment" />
        <ListRow title="Quote follow-up" />
      </ListCard>,
    )
    const list = screen.getByRole('list', { name: 'Workflows in Sales' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows its empty message instead of an empty list', () => {
    render(<ListCard label="Functions" empty="No functions yet." />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText('No functions yet.')).toBeInTheDocument()
  })
})

describe('ListRow', () => {
  it('makes only the title a link when given an href', () => {
    render(
      <ListCard>
        <ListRow
          title="Lead enrichment"
          href="/workflows/lead"
          description="Enrich new CRM leads"
          trailing={<button type="button">Share</button>}
        />
      </ListCard>,
    )
    expect(screen.getByRole('link')).toHaveAccessibleName('Lead enrichment')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/workflows/lead')
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('renders the title as text without an href', () => {
    render(
      <ListCard>
        <ListRow title="Weekly pipeline report" />
      </ListCard>,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('SectionHeader', () => {
  it('is a heading at the requested level', () => {
    render(<SectionHeader title="Recent activity" as="h3" caption="Across every project" />)
    expect(screen.getByRole('heading', { level: 3, name: 'Recent activity' })).toBeInTheDocument()
  })
})
