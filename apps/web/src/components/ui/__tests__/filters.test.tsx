import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from '../search-field'
import { SegmentedFilter } from '../segmented-filter'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs'

const OPTIONS = [
  { id: 'all', label: 'All', count: 4 },
  { id: 'failing', label: 'Failing', count: 1, tone: 'danger' as const },
  { id: 'draft', label: 'Drafts' },
]

describe('SegmentedFilter', () => {
  it('is a labelled group with exactly one pressed button', () => {
    render(
      <SegmentedFilter
        label="Filter workflows"
        options={OPTIONS}
        value="failing"
        onChange={vi.fn()}
      />,
    )
    const group = screen.getByRole('group', { name: 'Filter workflows' })
    const pressed = within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveAccessibleName('Failing 1')
  })

  it('puts each count in its button name, apart from the label', () => {
    render(<SegmentedFilter label="Filter" options={OPTIONS} value="all" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'All 4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument()
  })

  it('reports the picked option', async () => {
    const onChange = vi.fn()
    render(<SegmentedFilter label="Filter" options={OPTIONS} value="all" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Failing 1' }))
    expect(onChange).toHaveBeenCalledWith('failing')
  })
})

describe('Tabs', () => {
  it('moves between tabs with the arrow keys and shows one panel', async () => {
    render(
      <Tabs defaultValue="general">
        <TabsList aria-label="Workspace settings">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="general">General panel</TabsContent>
        <TabsContent value="members">Members panel</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Workspace settings' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'General' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Members panel')
  })
})

describe('SearchField', () => {
  it('is a search box named by its label, reporting what is typed', async () => {
    const onChange = vi.fn()
    render(<SearchField label="Search runs" placeholder="Run ID" value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search runs' }), 'r')
    expect(onChange).toHaveBeenCalledWith('r')
  })

  it('announces its shortcut without reading the hint glyphs', () => {
    render(
      <SearchField
        label="Search Acme Inc"
        value=""
        onChange={vi.fn()}
        shortcut={{ hint: '⌘K', keys: 'Meta+K' }}
      />,
    )
    expect(screen.getByRole('searchbox')).toHaveAttribute('aria-keyshortcuts', 'Meta+K')
    expect(screen.getByText('⌘K')).toHaveAttribute('aria-hidden', 'true')
  })

  it('empties itself on Escape', async () => {
    const onChange = vi.fn()
    render(<SearchField label="Search projects" value="mark" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox'), '{Escape}')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('hands its input to a ref, so a shortcut can focus it', () => {
    const ref = createRef<HTMLInputElement>()
    render(<SearchField label="Search projects" value="" onChange={vi.fn()} ref={ref} />)
    ref.current?.focus()
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })
})
