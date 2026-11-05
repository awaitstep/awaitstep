import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ItemPlaceholder } from '../item-placeholder'

describe('ItemPlaceholder', () => {
  it('says a sample item does not open, and leads back to its workspace', () => {
    render(
      <ItemPlaceholder
        slugs={{ org: 'acme', project: 'core', workspace: 'sales' }}
        itemId="itm_1"
      />,
    )
    expect(screen.getByRole('heading', { name: 'This is sample data' })).toBeVisible()
    expect(screen.getByText('itm_1')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to the workspace' })).toHaveAttribute(
      'href',
      '/acme/core/sales/overview',
    )
  })
})
