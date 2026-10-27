import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemPlaceholder } from '../item-placeholder'

describe('ItemPlaceholder', () => {
  it('names what was opened: a function, a workflow or a run', () => {
    const { rerender } = render(<ItemPlaceholder org="acme" itemId="itm_1" kind="function" />)
    expect(screen.getByRole('heading', { name: 'This function is sample data' })).toBeVisible()
    expect(screen.getByText(/Real functions open in the editor/)).toBeVisible()
    rerender(<ItemPlaceholder org="acme" itemId="itm_1" kind="workflow" runId="run_9" />)
    expect(screen.getByRole('heading', { name: 'This run is sample data' })).toBeVisible()
    expect(screen.getByText('run_9')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
  })
})
