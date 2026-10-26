import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogTitle } from '../dialog'
import { Sheet, SheetContent, SheetTitle } from '../sheet'
import { OverlayBody, OverlayFooter, OverlayHeader } from '../overlay-parts'

function backdropOf(dialog: HTMLElement): Element | null {
  return dialog.previousElementSibling
}

describe('DialogContent defaults', () => {
  it('keeps the original padded 400px dialog and light backdrop when given no options', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Rename file</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Rename file' })
    expect(dialog).toHaveClass('w-[400px]', 'p-6', 'rounded-md', 'bg-card')
    expect(backdropOf(dialog)).toHaveClass('bg-black/40')
  })

  it('drops the padding and dims harder in the sectioned layout', () => {
    render(
      <Dialog open>
        <DialogContent layout="sectioned" size="lg" aria-describedby={undefined}>
          <DialogTitle>Create a workspace</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Create a workspace' })
    expect(dialog).toHaveClass('w-[560px]', 'rounded-2xl', 'flex-col')
    expect(dialog).not.toHaveClass('p-6')
    expect(backdropOf(dialog)).toHaveClass('bg-black/70')
  })

  it('lets a caller className still override the defaults', () => {
    render(
      <Dialog open>
        <DialogContent className="w-[560px] p-0" aria-describedby={undefined}>
          <DialogTitle>Command palette</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Command palette' })
    expect(dialog).toHaveClass('w-[560px]', 'p-0')
    expect(dialog).not.toHaveClass('w-[400px]', 'p-6')
  })
})

describe('SheetContent defaults', () => {
  it('keeps the original right sheet width and surface', () => {
    render(
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Run detail</SheetTitle>
        </SheetContent>
      </Sheet>,
    )
    const sheet = screen.getByRole('dialog', { name: 'Run detail' })
    expect(sheet).toHaveClass('right-0', 'max-w-md', 'bg-background')
    expect(backdropOf(sheet)).toHaveClass('bg-black/40')
  })

  it('keeps a left sheet narrower, as the mobile drawer expects', () => {
    render(
      <Sheet open>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle>Navigation</SheetTitle>
        </SheetContent>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toHaveClass('left-0', 'max-w-xs')
  })

  it('widens to 560px on the card surface in the sectioned layout', () => {
    render(
      <Sheet open>
        <SheetContent size="lg" layout="sectioned" aria-describedby={undefined}>
          <SheetTitle>Daniel Kim</SheetTitle>
        </SheetContent>
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Daniel Kim' })).toHaveClass(
      'max-w-[560px]',
      'bg-card',
    )
  })
})

describe('Overlay parts', () => {
  function renderSectioned(onOpenChange = vi.fn()) {
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent layout="sectioned" size="lg">
          <OverlayHeader
            leading={<span>S</span>}
            title="Create a workspace"
            description="A separate space in Project 101."
          />
          <OverlayBody>
            <p>Body</p>
          </OverlayBody>
          <OverlayFooter start="Keys can be revoked later">
            <button type="button">Create workspace</button>
          </OverlayFooter>
        </DialogContent>
      </Dialog>,
    )
    return { onOpenChange }
  }

  it('names and describes the overlay from the header', () => {
    renderSectioned()
    const dialog = screen.getByRole('dialog', { name: 'Create a workspace' })
    expect(dialog).toHaveAccessibleDescription('A separate space in Project 101.')
  })

  it('has a labelled Close button that closes the overlay', async () => {
    const { onOpenChange } = renderSectioned()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the footer hint beside the actions', () => {
    renderSectioned()
    expect(screen.getByText('Keys can be revoked later')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeInTheDocument()
  })
})
