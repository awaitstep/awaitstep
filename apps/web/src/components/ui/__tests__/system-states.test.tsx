import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadError } from '../load-error'
import { NotFoundView } from '../not-found-view'
import { Bone, ListCardSkeleton, LoadingRegion } from '../skeletons'

describe('Bone', () => {
  it('stops pulsing for people who reduce motion', () => {
    const { container } = render(<Bone />)
    expect(container.firstChild).toHaveClass('animate-pulse', 'motion-reduce:animate-none')
  })
})

describe('LoadingRegion', () => {
  it('is one status named by its label, with the placeholders hidden', () => {
    const { container } = render(
      <LoadingRegion label="Loading workflows">
        <ListCardSkeleton rows={2} />
      </LoadingRegion>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/^Loading workflows$/)
    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(
      container.querySelector('.animate-pulse') as HTMLElement,
    )
  })
})

describe('LoadError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderError(props: Partial<Parameters<typeof LoadError>[0]> = {}) {
    const onRetry = vi.fn()
    return render(
      <LoadError
        title="We couldn't load workflows"
        detail="Nothing was changed."
        onRetry={onRetry}
        statusHref="https://status.awaitstep.dev"
        errorId="req_7f2a91c4"
        {...props}
      />,
    )
  }

  it('announces the title and detail as an alert', () => {
    renderError()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't load workflowsNothing was changed.",
    )
  })

  it('retries on click and counts the attempts', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderError({ attempts: 2, onRetry })
    await user.click(screen.getByRole('button', { name: 'Try again (2)' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('ignores clicks while retrying but stays focusable', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    renderError({ retrying: true, onRetry })
    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(onRetry).not.toHaveBeenCalled()
    expect(button).toHaveFocus()
  })

  it('opens the status page in a new tab', () => {
    renderError()
    const link = screen.getByRole('link', { name: 'Status page ↗' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('copies the error ID and says so', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderError()
    await user.click(screen.getByRole('button', { name: 'Copy error ID req_7f2a91c4' }))
    expect(copy).toHaveBeenCalledWith('req_7f2a91c4')
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
  })

  it('forgets "Copied" when a retry brings a new error ID', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const { rerender } = renderError()
    await user.click(screen.getByRole('button', { name: 'Copy error ID req_7f2a91c4' }))
    rerender(
      <LoadError
        title="We couldn't load workflows"
        detail="Nothing was changed."
        onRetry={vi.fn()}
        errorId="req_0b1c2d3e"
      />,
    )
    expect(screen.getByRole('status')).not.toHaveTextContent('Copied')
  })

  it('says when copying the error ID fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    renderError()
    await user.click(screen.getByRole('button', { name: 'Copy error ID req_7f2a91c4' }))
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t copy.')
  })
})

describe('NotFoundView', () => {
  it('names the kind, the slug and the path, and links back up', () => {
    render(
      <NotFoundView
        kind="workspace"
        name="finance"
        parentName="Project 101"
        path="/acme/project-101/finance"
        primary={{ label: 'Open Project 101', href: '/acme/project-101' }}
        secondary={{ label: 'Back to projects', href: '/acme/projects' }}
      />,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'We can’t find that workspace' }),
    ).toBeVisible()
    expect(screen.getByText('finance')).toBeInTheDocument()
    expect(screen.getByText('/acme/project-101/finance')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Project 101' })).toHaveAttribute(
      'href',
      '/acme/project-101',
    )
    expect(screen.getByRole('link', { name: 'Back to projects' })).toHaveAttribute(
      'href',
      '/acme/projects',
    )
  })
})
