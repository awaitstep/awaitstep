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
  it('puts a badge beside the title', () => {
    render(
      <ListCard>
        <ListRow title="Chrome on macOS" badge={<span>This device</span>} />
      </ListCard>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent('Chrome on macOSThis device')
  })

  it('opens from anywhere on the row, through its one link, with its controls still their own', () => {
    render(
      <ListCard>
        <ListRow
          title="Lead enrichment"
          href="/workflows/lead"
          description="Enrich new CRM leads"
          trailing={
            <>
              <span>Deployed</span>
              <button type="button" className="relative z-10">
                Share
              </button>
            </>
          }
        />
      </ListCard>,
    )
    expect(screen.getByRole('link')).toHaveAccessibleName('Lead enrichment')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/workflows/lead')
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    // One link, stretched over the row (jsdom can't hit-test, so the classes stand in);
    // the controls sit above that layer, so a click on them stays theirs.
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveClass('relative', 'cursor-pointer')
    expect(screen.getByRole('link')).toHaveClass('after:absolute', 'after:inset-0')
    // Only the control is raised: the rest of the row's right side still opens it.
    expect(screen.getByText('Deployed').parentElement).not.toHaveClass('z-10')
  })

  it('is no link and no hover target without an href', () => {
    render(
      <ListCard>
        <ListRow title="Chrome on macOS" />
      </ListCard>,
    )
    expect(screen.getByRole('listitem')).not.toHaveClass('cursor-pointer')
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
