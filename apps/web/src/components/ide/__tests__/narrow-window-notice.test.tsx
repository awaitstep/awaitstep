import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NarrowWindowNotice } from '../narrow-window-notice'

describe('NarrowWindowNotice', () => {
  it('offers the canvas and a way back', async () => {
    const onOpenCanvas = vi.fn()
    const onBack = vi.fn()
    render(<NarrowWindowNotice onOpenCanvas={onOpenCanvas} onBack={onBack} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open canvas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onOpenCanvas).toHaveBeenCalled()
    expect(onBack).toHaveBeenCalled()
  })
})
