import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCanvasLayoutStore } from '../../../stores/canvas-layout-store'
import { NodePalette } from '../node-palette'

vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({ registry: { getAll: () => [] } }),
}))

beforeEach(() => {
  useCanvasLayoutStore.setState({ paletteOpen: true })
})

describe('NodePalette', () => {
  it('opens the marketplace over the canvas instead of a new tab', async () => {
    const onBrowse = vi.fn()
    render(<NodePalette onAddNode={vi.fn()} onBrowseMarketplace={onBrowse} />)

    const row = screen.getByRole('button', { name: 'Browse Marketplace' })
    expect(row).not.toHaveAttribute('target')
    expect(row.closest('a')).toBeNull()

    await userEvent.click(row)
    expect(onBrowse).toHaveBeenCalledTimes(1)
  })
})
