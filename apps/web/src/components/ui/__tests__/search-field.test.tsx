import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchField } from '../search-field'

function Field() {
  const [value, setValue] = useState('')
  return (
    <SearchField
      label="Search nodes"
      placeholder="Search nodes"
      value={value}
      onChange={setValue}
    />
  )
}

describe('SearchField', () => {
  it('is a labelled search input the browser can clear', () => {
    render(<Field />)
    expect(screen.getByRole('searchbox', { name: 'Search nodes' })).toHaveAttribute(
      'type',
      'search',
    )
  })

  it('carries the one size every page uses: 36 px, full width until wide screens, then 320 px', () => {
    render(<Field />)
    const box = screen.getByRole('searchbox').parentElement!
    expect(box).toHaveClass('h-9', 'w-full', 'min-w-[min(200px,100%)]', 'lg:max-w-[320px]')
  })

  it('empties on Escape', async () => {
    render(<Field />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'slack{Escape}')
    expect(input).toHaveValue('')
  })
})
