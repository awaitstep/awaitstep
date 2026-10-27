import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DangerZone } from '../danger-zone'
import { FormCard } from '../form-card'

// One width for settings cards (`--settings-max-width` in styles.css), so
// they never stretch across a wide screen.
describe('settings cards', () => {
  it('cap the form and the Danger zone at the shared settings width', () => {
    render(
      <>
        <FormCard id="general" onSubmit={vi.fn()}>
          <p>Fields</p>
        </FormCard>
        <DangerZone>
          <p>Delete</p>
        </DangerZone>
      </>,
    )
    expect(screen.getByText('Fields').closest('form')).toHaveClass('settings-width')
    expect(screen.getByRole('region', { name: 'Danger zone' })).toHaveClass('settings-width')
  })
})
