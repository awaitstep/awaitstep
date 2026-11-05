import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewSwitch } from '../view-switch'

describe('ViewSwitch', () => {
  it('shows which view you are on and does nothing when you pick it again', async () => {
    const onSelect = vi.fn()
    render(<ViewSwitch current="code" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Code/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Canvas/ })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: /Code/ }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('switches to the other view', async () => {
    const onSelect = vi.fn()
    render(<ViewSwitch current="canvas" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Code/ }))
    expect(onSelect).toHaveBeenCalledWith('code')
  })
})
