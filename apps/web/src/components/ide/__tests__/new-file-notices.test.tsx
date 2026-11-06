import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyFileHint, ScheduleBanner } from '../new-file-notices'

describe('new-file notices', () => {
  it('hints how to import an empty module, by its own path', () => {
    render(<EmptyFileHint path="services/new.ts" />)
    expect(screen.getByText('Export something, then import it as #app/services/new')).toBeVisible()
  })

  it('says only "Empty file" for a file nothing imports', () => {
    render(<EmptyFileHint path="package.json" />)
    expect(screen.getByText('Empty file')).toBeVisible()
  })

  it('tells a scheduled handler it has no schedule, with a way to the canvas', async () => {
    const onOpenCanvas = vi.fn()
    render(<ScheduleBanner onOpenCanvas={onOpenCanvas} />)
    expect(screen.getByText(/no schedule yet/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open canvas' }))
    expect(onOpenCanvas).toHaveBeenCalledTimes(1)
  })
})
