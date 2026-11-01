import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchableSelect, type SearchableOption } from '../searchable-select'

const OPTIONS: SearchableOption<string>[] = [
  { value: 'All', label: 'All', count: 6 },
  { value: 'AI', label: 'AI', count: 2 },
  { value: 'Data', label: 'Data', count: 1 },
  { value: 'Messaging', label: 'Messaging', count: 3 },
]

function Category() {
  const [value, setValue] = useState('All')
  return (
    <SearchableSelect
      label="Category"
      value={value}
      onChange={setValue}
      options={OPTIONS}
      searchPlaceholder="Search categories"
      emptyText="No category matches."
    />
  )
}

describe('SearchableSelect', () => {
  it('names the trigger with its label and current choice', () => {
    render(<Category />)
    expect(screen.getByRole('button', { name: 'Category: All' })).toBeInTheDocument()
  })

  it('keeps its own width in a toolbar row, so the value and chevron stay inside it', () => {
    render(<Category />)
    const trigger = screen.getByRole('button', { name: 'Category: All' })
    expect(trigger).toHaveClass('shrink-0', 'whitespace-nowrap')
    expect(trigger).not.toHaveClass('min-w-0')
    expect(trigger).toHaveTextContent('CategoryAll')
    // The chevron sits at the right edge however wide the trigger is.
    expect(trigger.querySelector('svg')).toHaveClass('ml-auto')
  })

  it('narrows the list as you type and picks with Enter', async () => {
    render(<Category />)
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    expect(screen.getAllByRole('option')).toHaveLength(4)
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'mess{Enter}')
    expect(screen.getByRole('button', { name: 'Category: Messaging' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search categories')).not.toBeInTheDocument()
  })

  it('marks the current choice and starts each opening from the whole list', async () => {
    render(<Category />)
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    await userEvent.click(screen.getByRole('option', { name: /^Data/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Category: Data' }))
    expect(screen.getByPlaceholderText('Search categories')).toHaveValue('')
    expect(screen.getByRole('option', { name: /Selected\s*Data/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('opens aligned to its right edge, so a select ending a row stays off the screen edge', async () => {
    render(<Category />)
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    const list = screen.getByPlaceholderText('Search categories').closest('[data-align]')
    expect(list).toHaveAttribute('data-align', 'end')
  })

  it('says when nothing matches', async () => {
    render(<Category />)
    await userEvent.click(screen.getByRole('button', { name: 'Category: All' }))
    await userEvent.type(screen.getByPlaceholderText('Search categories'), 'zzz')
    expect(screen.getByText('No category matches.')).toBeVisible()
  })
})
