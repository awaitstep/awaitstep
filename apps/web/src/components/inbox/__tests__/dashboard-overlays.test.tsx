import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInstanceStore } from '../../../stores/instance-store'
import { DashboardOverlays } from '../dashboard-overlays'

// The package a wrapping workspace would install, plugged in here.
vi.mock('virtual:awaitstep/extensions', async () => {
  const { testExtension } = await import('../../../extensions/__tests__/fixtures/test-extension')
  return { default: [testExtension] }
})
vi.mock('../inbox-popover', () => ({ InboxPopover: () => <p>Inbox</p> }))
vi.mock('../whats-new-sheet', () => ({ WhatsNewSheet: () => <p>What’s new</p> }))

beforeEach(() => useInstanceStore.setState({ features: [], disabled: [] }))

describe('DashboardOverlays', () => {
  it('opens an enabled extension’s panel by its id, titled by its label', () => {
    useInstanceStore.setState({ features: ['test-ext'] })
    render(<DashboardOverlays org="acme" open="support" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Support' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Support for acme' })).toBeInTheDocument()
  })

  it('closes the panel from its close button and from the extension’s own body', () => {
    useInstanceStore.setState({ features: ['test-ext'] })
    const onClose = vi.fn()
    render(<DashboardOverlays org="acme" open="support" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Support for acme' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('opens nothing for the panel of an extension the instance does not list', () => {
    render(<DashboardOverlays org="acme" open="support" onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the built-in overlays and opens nothing for an unknown id', () => {
    useInstanceStore.setState({ features: ['test-ext'] })
    const { rerender } = render(<DashboardOverlays org="acme" open="inbox" onClose={vi.fn()} />)
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    rerender(<DashboardOverlays org="acme" open="nope" onClose={vi.fn()} />)
    expect(screen.queryByText('Inbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
