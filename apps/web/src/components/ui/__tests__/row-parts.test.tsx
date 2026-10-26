import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvatarStack } from '../avatar-stack'
import { RunHistoryBars } from '../run-history-bars'
import { ShareToggle } from '../share-toggle'
import { PEOPLE } from './fixtures/lists'

describe('AvatarStack', () => {
  it('names everyone, folding the rest into "+N"', () => {
    render(<AvatarStack people={PEOPLE} max={2} />)
    expect(
      screen.getByRole('img', { name: 'Ama Mensah, Daniel Kim and 4 others' }),
    ).toHaveTextContent('+4')
  })

  it('lists everyone by name when all fit', () => {
    render(<AvatarStack people={PEOPLE.slice(0, 3)} />)
    expect(
      screen.getByRole('img', { name: 'Ama Mensah, Daniel Kim and Lena Ortiz' }),
    ).not.toHaveTextContent('+')
  })

  it('draws two people who share a name as two avatars', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AvatarStack
        people={[
          { id: 'a', name: 'Alex Kim' },
          { id: 'b', name: 'Alex Kim' },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Alex Kim and Alex Kim' }).children).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('says "other" for a single extra person', () => {
    render(<AvatarStack people={PEOPLE.slice(0, 4)} />)
    expect(
      screen.getByRole('img', { name: 'Ama Mensah, Daniel Kim, Lena Ortiz and 1 other' }),
    ).toHaveTextContent('+1')
  })
})

describe('RunHistoryBars', () => {
  it('counts successes and failures in its label', () => {
    render(<RunHistoryBars runs={['ok', 'fail', 'ok', 'ok', 'fail']} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Last 5 runs: 3 succeeded, 2 failed')
  })

  it('leaves out a zero count', () => {
    render(<RunHistoryBars runs={['ok', 'ok']} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Last 2 runs: 2 succeeded')
  })

  it('says "No runs yet" when there are none', () => {
    render(<RunHistoryBars runs={[]} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('No runs yet')
  })

  it('draws and describes only the last ten runs', () => {
    const runs = [...Array(5).fill('fail'), ...Array(10).fill('ok')]
    const { container } = render(<RunHistoryBars runs={runs} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Last 10 runs: 10 succeeded')
    expect(container.querySelector('[role="img"]')?.children).toHaveLength(10)
  })
})

describe('ShareToggle', () => {
  it('is a named switch that reports the new state', async () => {
    const onChange = vi.fn()
    render(<ShareToggle shared={false} onChange={onChange} label="Share Lead enrichment" />)
    const toggle = screen.getByRole('switch', { name: 'Share Lead enrichment' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('stays focusable for Viewers, ignores clicks and Space, and gives the reason', async () => {
    const onChange = vi.fn()
    render(
      <ShareToggle
        shared
        onChange={onChange}
        label="Share Lead enrichment"
        disabledReason="Viewers can't change sharing"
      />,
    )
    const toggle = screen.getByRole('switch', { name: 'Share Lead enrichment' })
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    expect(toggle).toHaveAccessibleDescription("Viewers can't change sharing")
    await userEvent.click(toggle)
    await userEvent.keyboard('{Tab}{Shift>}{Tab}{/Shift}')
    expect(toggle).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).not.toHaveBeenCalled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})
