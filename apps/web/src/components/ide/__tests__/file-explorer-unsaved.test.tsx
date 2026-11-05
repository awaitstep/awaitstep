import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UnsavedSection } from '../file-explorer-unsaved'

describe('UnsavedSection', () => {
  it('lists nothing while nothing is unsaved', () => {
    render(<UnsavedSection paths={[]} onReview={vi.fn()} />)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('counts the files and names each with its folder', () => {
    render(
      <UnsavedSection paths={['lib/payments/charge.ts', 'lib/errors.ts']} onReview={vi.fn()} />,
    )
    expect(screen.getByText('Unsaved · 2')).toBeInTheDocument()
    expect(screen.getByText('charge.ts')).toBeInTheDocument()
    expect(screen.getByText('lib/payments')).toBeInTheDocument()
  })

  it('Review opens the review from the first file, a row opens that file’s diff', async () => {
    const onReview = vi.fn()
    render(<UnsavedSection paths={['a.ts', 'lib/b.ts']} onReview={onReview} />)
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onReview).toHaveBeenLastCalledWith()
    await userEvent.click(screen.getByRole('button', { name: /b\.ts/ }))
    expect(onReview).toHaveBeenLastCalledWith('lib/b.ts')
  })
})
