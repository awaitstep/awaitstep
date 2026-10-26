import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Banner } from '../banner'
import { RequestAction } from '../request-action'
import { RolePill } from '../role-pill'

describe('Banner', () => {
  it('shows its copy and action without being a live region', () => {
    const { container } = render(
      <Banner tone="warn" action={<a href="/status">Status page</a>}>
        Your deployed workflows keep running.
      </Banner>,
    )
    expect(screen.getByText('Your deployed workflows keep running.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Status page' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveClass('bg-tone-warn')
  })
})

describe('RolePill', () => {
  it('names the role in words and hides its icon', () => {
    const { container } = render(<RolePill role="viewer" />)
    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

function AskHarness({ onRequest }: { onRequest: () => void }) {
  const [requested, setRequested] = useState(false)
  function handleRequest() {
    onRequest()
    setRequested(true)
  }
  return (
    <RequestAction
      label="Ask for edit access"
      sentLabel="Asked Ama Mensah"
      requested={requested}
      onRequest={handleRequest}
    />
  )
}

describe('RequestAction', () => {
  it('asks once, then replaces the button with a focused status line', async () => {
    const user = userEvent.setup()
    const onRequest = vi.fn()
    render(<AskHarness onRequest={onRequest} />)

    await user.click(screen.getByRole('button', { name: 'Ask for edit access' }))

    expect(onRequest).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Asked Ama Mensah')
    expect(status).toHaveFocus()
  })

  it('does not steal focus when it renders already requested', () => {
    render(
      <RequestAction
        label="Ask for edit access"
        sentLabel="Asked Ama Mensah"
        requested
        onRequest={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Asked Ama Mensah')
    expect(screen.getByRole('status')).not.toHaveFocus()
  })
})
