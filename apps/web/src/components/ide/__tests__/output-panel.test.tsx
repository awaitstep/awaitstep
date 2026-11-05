import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTestSessionStore, type SessionLogLine } from '../../../stores/test-session-store'
import { OutputPanel } from '../output-panel'

const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockClear()
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView
  useTestSessionStore.setState({ views: {}, payloads: {}, payloadErrors: {} })
})

const noon = new Date(2026, 10, 5, 12, 0, 0, 5).getTime()
const lines: SessionLogLine[] = [
  { id: 1, stream: 'stdout', text: 'fetch GET /orders 200', timestamp: noon },
  { id: 2, stream: 'stderr', text: 'PaymentDeclined: ord_1', timestamp: noon + 1 },
  { id: 3, stream: 'stdout', text: 'done', timestamp: noon + 2 },
]

function renderOutput(over: Partial<React.ComponentProps<typeof OutputPanel>> = {}) {
  return render(<OutputPanel sessionId="s1" lines={lines} clearedBefore={0} {...over} />)
}

describe('OutputPanel', () => {
  it('puts a local HH:MM:SS.mmm time on every line', () => {
    renderOutput()
    const log = screen.getByRole('log')
    expect(within(log).getAllByText(/^12:00:00\.\d{3}$/)).toHaveLength(3)
    expect(within(log).getByText('12:00:00.005')).toBeInTheDocument()
  })

  it('stderr chip shows the count and only stderr lines', async () => {
    renderOutput()
    const chip = screen.getByRole('button', { name: 'stderr 1' })
    await userEvent.click(chip)
    const log = screen.getByRole('log')
    expect(within(log).getByText('PaymentDeclined: ord_1')).toBeInTheDocument()
    expect(within(log).queryByText('done')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(within(log).getByText('done')).toBeInTheDocument()
  })

  it('narrows as you type and brings everything back when cleared', async () => {
    renderOutput()
    const filter = screen.getByLabelText('Filter output')
    await userEvent.type(filter, 'paym')
    const log = screen.getByRole('log')
    expect(within(log).queryByText('done')).not.toBeInTheDocument()
    expect(within(log).getByText('PaymentDeclined: ord_1')).toBeInTheDocument()
    await userEvent.clear(filter)
    expect(within(log).getByText('done')).toBeInTheDocument()
  })

  it('says when nothing matches', async () => {
    renderOutput()
    await userEvent.type(screen.getByLabelText('Filter output'), 'zzz')
    expect(screen.getByText('No lines match.')).toBeInTheDocument()
  })

  it('Clear view hides what was logged and keeps the session log', async () => {
    useTestSessionStore.getState().appendLogs('s1', [lines[0]!, lines[1]!, lines[2]!], '3')
    const { rerender } = renderOutput({ lines: useTestSessionStore.getState().views.s1!.logs })
    await userEvent.click(screen.getByRole('button', { name: /Clear view/ }))
    const cleared = useTestSessionStore.getState().views.s1!
    expect(cleared.clearedBefore).toBe(3)
    expect(cleared.logs).toHaveLength(3)
    rerender(
      <OutputPanel sessionId="s1" lines={cleared.logs} clearedBefore={cleared.clearedBefore} />,
    )
    expect(screen.getByText('Output appears here while a test session runs.')).toBeInTheDocument()
    // A new line after the clear shows up; reopening the tab (remount) keeps the lines hidden.
    useTestSessionStore
      .getState()
      .appendLogs('s1', [{ timestamp: noon, stream: 'stdout', text: 'new' }], '4')
    const next = useTestSessionStore.getState().views.s1!
    rerender(<OutputPanel sessionId="s1" lines={next.logs} clearedBefore={next.clearedBefore} />)
    expect(screen.getByText('new')).toBeInTheDocument()
    expect(screen.queryByText('done')).not.toBeInTheDocument()
  })

  it('the tooltip says the session keeps logging', () => {
    renderOutput()
    expect(screen.getByRole('button', { name: /Clear view/ })).toHaveAttribute(
      'title',
      'Clears this view. The session keeps logging.',
    )
  })
})

/** Records writes to the log's scrollTop; its content is 1000px tall. */
function trackScrollTop(el: HTMLElement) {
  const writes: number[] = []
  Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true })
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => writes.at(-1) ?? 0,
    set: (value: number) => writes.push(value),
  })
  return writes
}

describe('Follow', () => {
  function scrollTo(
    el: HTMLElement,
    { top, height, client }: { top: number; height: number; client: number },
  ) {
    Object.defineProperty(el, 'scrollHeight', { value: height, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: client, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true, writable: true })
    fireEvent.scroll(el)
  }

  it('is on to start with and follows new lines', () => {
    const { rerender } = renderOutput()
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const writes = trackScrollTop(screen.getByRole('log'))
    rerender(
      <OutputPanel
        sessionId="s1"
        lines={[...lines, { id: 4, stream: 'stdout', text: 'more', timestamp: noon }]}
        clearedBefore={0}
      />,
    )
    // The log scrolls itself; scrollIntoView would also scroll the dock and
    // page, pushing the payload editor out of view while typing.
    expect(writes).toContain(1000)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('turns off when scrolling up, and new lines then do not move the view', () => {
    const { rerender } = renderOutput()
    scrollTo(screen.getByRole('log'), { top: 0, height: 1000, client: 200 })
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
    const writes = trackScrollTop(screen.getByRole('log'))
    rerender(
      <OutputPanel
        sessionId="s1"
        lines={[...lines, { id: 4, stream: 'stdout', text: 'more', timestamp: noon }]}
        clearedBefore={0}
      />,
    )
    expect(writes).toEqual([])
  })

  it('turns back on when you return to the bottom', () => {
    renderOutput()
    const log = screen.getByRole('log')
    scrollTo(log, { top: 0, height: 1000, client: 200 })
    scrollTo(log, { top: 790, height: 1000, client: 200 })
    expect(screen.getByRole('button', { name: /Following/ })).toBeInTheDocument()
  })

  it('pressing Follow jumps to the end and turns it on', async () => {
    renderOutput()
    scrollTo(screen.getByRole('log'), { top: 0, height: 1000, client: 200 })
    const writes = trackScrollTop(screen.getByRole('log'))
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }))
    expect(writes).toContain(1000)
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
