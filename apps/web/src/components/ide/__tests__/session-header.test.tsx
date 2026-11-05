import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { TestSessionState } from '../../../hooks/use-test-session'
import { UP_TO_DATE } from '../../../lib/ide/session-staleness'
import { SessionHeader } from '../session-header'

function state(over: Partial<TestSessionState> = {}): TestSessionState {
  return {
    session: null,
    starting: false,
    stopping: false,
    stale: UP_TO_DATE,
    streamError: null,
    startRequestedAt: null,
    viewingOlder: false,
    start: vi.fn(),
    stop: vi.fn(),
    ...over,
  } as unknown as TestSessionState
}

const starting = {
  id: 's',
  status: 'starting',
  runtime: 'sandbox',
  createdAt: '2026-11-05T14:00:00.000Z',
} as TestSessionState['session']

afterEach(() => vi.useRealTimers())

describe('SessionHeader', () => {
  it('keeps the ticking seconds out of the live region, which announces state changes only', () => {
    render(<SessionHeader state={state({ session: starting })} />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Starting the container…')
    expect(status.textContent).not.toMatch(/\d+s/)
  })

  it('does not re-render forever when the server clock is ahead of this one', () => {
    // createdAt in the future: a fresh Date.now() clamp per render used to give a new value each time.
    vi.useFakeTimers({ now: new Date('2026-11-05T13:59:00.000Z') })
    render(<SessionHeader state={state({ session: starting })} />)
    expect(screen.getByText('0s')).toBeInTheDocument()
  })

  it('says sessions run the latest version when an older one is being viewed', () => {
    render(<SessionHeader state={state({ viewingOlder: true })} />)
    expect(
      screen.getByText(/run the latest version, not the one you’re viewing/),
    ).toBeInTheDocument()
  })

  it('says Preparing while the request is open and no session is known yet', () => {
    render(<SessionHeader state={state({ starting: true, startRequestedAt: Date.now() })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your files…')
  })

  it('switches to the container wording and offers Cancel once the reserved session is read', () => {
    render(<SessionHeader state={state({ starting: true, session: starting })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Starting the container…')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
