import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalDialog } from '../modal-dialog'
import { SidePanel } from '../side-panel'

const OVERLAYS = [
  { name: 'ModalDialog', Overlay: ModalDialog },
  { name: 'SidePanel', Overlay: SidePanel },
] as const

describe.each(OVERLAYS)('$name', ({ Overlay }) => {
  function Harness({ description }: { description?: string }) {
    const [open, setOpen] = useState(false)
    return (
      <Overlay
        open={open}
        onOpenChange={setOpen}
        trigger={<button type="button">New workspace</button>}
        title="Create a workspace"
        description={description}
        actions={<button type="button">Create workspace</button>}
      >
        <label>
          Name
          <input defaultValue="Support" />
        </label>
      </Overlay>
    )
  }

  async function openIt(description?: string) {
    render(<Harness description={description} />)
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    return screen.getByRole('dialog', { name: 'Create a workspace' })
  }

  it('is a dialog named by its title and described by its description', async () => {
    const dialog = await openIt('A separate space in Project 101.')
    expect(dialog).toHaveAccessibleDescription('A separate space in Project 101.')
  })

  it('carries no dangling description when none is given', async () => {
    const dialog = await openIt()
    expect(dialog).not.toHaveAttribute('aria-describedby')
  })

  it('keeps Tab inside the dialog', async () => {
    const dialog = await openIt()
    for (let i = 0; i < 5; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    await openIt()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New workspace' })).toHaveFocus()
  })

  it('closes from the labelled Close button', async () => {
    await openIt()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
