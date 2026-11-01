import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { toast } from 'sonner'
import { actionToast } from '../../../lib/action-toast'
import { Toaster } from '../toaster'

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
})

function toaster() {
  return document.querySelector('[data-sonner-toaster]') as HTMLElement
}

describe('Toaster', () => {
  it('sits bottom right, unstyled, so the board’s styles apply', async () => {
    render(<Toaster theme="dark" />)
    act(() => actionToast.success('Profile saved'))
    const item = (await screen.findByText('Profile saved')).closest('[data-sonner-toast]')!
    expect(item).toHaveClass('action-toast')
    expect(item).toHaveAttribute('data-type', 'success')
    expect(item).toHaveAttribute('data-styled', 'false')
    expect(toaster()).toHaveAttribute('data-y-position', 'bottom')
    expect(toaster()).toHaveAttribute('data-x-position', 'right')
    expect(toaster()).toHaveAttribute('data-sonner-theme', 'dark')
  })

  it('draws each state’s icon and a close button', async () => {
    render(<Toaster theme="light" />)
    act(() => {
      actionToast.error('Couldn’t save it')
      actionToast.info('Unsaved changes discarded')
    })
    const failed = (await screen.findByText('Couldn’t save it')).closest('[data-sonner-toast]')!
    expect(failed).toHaveAttribute('data-type', 'error')
    expect(failed.querySelector('[data-icon] .lucide-circle-x')).not.toBeNull()
    expect(failed.querySelector('[data-close-button]')).not.toBeNull()
    const notice = screen.getByText('Unsaved changes discarded').closest('[data-sonner-toast]')!
    expect(notice.querySelector('[data-icon] .lucide-info')).not.toBeNull()
  })

  it('puts an action under the text, as a button', async () => {
    render(<Toaster theme="dark" />)
    act(() =>
      actionToast.success('Consumer added', {
        action: { label: 'Open in Code', onClick: () => {} },
      }),
    )
    expect(await screen.findByRole('button', { name: 'Open in Code' })).toHaveAttribute(
      'data-action',
    )
  })

  it('names its close button Dismiss', async () => {
    render(<Toaster theme="dark" />)
    act(() => actionToast.success('Saved'))
    expect(await screen.findByRole('button', { name: 'Dismiss' })).toHaveAttribute(
      'data-close-button',
    )
  })

  it('expands the stack while keyboard focus is in it, as hover does', async () => {
    render(<Toaster theme="dark" />)
    act(() => {
      actionToast.success('First')
      actionToast.success('Second')
    })
    const front = (await screen.findByText('Second')).closest<HTMLElement>('[data-sonner-toast]')!
    expect(front).toHaveAttribute('data-expanded', 'false')
    act(() => front.focus())
    await waitFor(() => expect(front).toHaveAttribute('data-expanded', 'true'))
    act(() => front.blur())
    await waitFor(() => expect(front).toHaveAttribute('data-expanded', 'false'))
  })

  it('dismisses only the toast in focus on Esc', async () => {
    render(<Toaster theme="dark" />)
    act(() => {
      actionToast.success('Kept')
      actionToast.success('Gone')
    })
    const gone = (await screen.findByText('Gone')).closest<HTMLElement>('[data-sonner-toast]')!
    act(() => gone.focus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Gone')).not.toBeInTheDocument())
    expect(screen.getByText('Kept')).toBeInTheDocument()
  })

  it('dismisses on Esc while focus is in a toast', async () => {
    render(<Toaster theme="dark" />)
    act(() => actionToast.success('Path copied'))
    const item = (await screen.findByText('Path copied')).closest('[data-sonner-toast]')!
    ;(item.querySelector('[data-close-button]') as HTMLElement).focus()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Path copied')).not.toBeInTheDocument())
  })
})
