// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from '../button'

describe('Button loading', () => {
  it('shows a spinner, marks itself busy and blocks clicks while loading', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Create
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('svg.animate-spin')).not.toBeNull()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('stays disabled without a spinner when only disabled', () => {
    render(<Button disabled>Create</Button>)
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.querySelector('svg')).toBeNull()
  })
})
