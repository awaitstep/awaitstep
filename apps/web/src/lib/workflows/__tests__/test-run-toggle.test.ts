import { describe, expect, it, vi } from 'vitest'
import { testRunIsLive, testRunToggle } from '../test-run-toggle'

const input = (over: Partial<Parameters<typeof testRunToggle>[0]> = {}) => ({
  status: null,
  starting: false,
  open: false,
  onStart: vi.fn(),
  onToggle: vi.fn(),
  ...over,
})

describe('the test run button', () => {
  it.each([
    [null, false, false],
    ['stopped', false, false],
    ['failed', false, false],
    ['starting', false, true],
    ['running', false, true],
    [null, true, true],
  ] as const)('a session that is %s (start asked: %s) is live: %s', (status, starting, live) => {
    expect(testRunIsLive(status, starting)).toBe(live)
  })

  it.each([null, 'stopped', 'failed'] as const)(
    'starts a run when the session is %s, whether or not the panel shows',
    (status) => {
      const given = input({ status, open: true })
      const toggle = testRunToggle(given)
      expect(toggle).toMatchObject({ label: 'Start test run', pressed: false })
      toggle.onClick()
      expect(given.onStart).toHaveBeenCalledOnce()
      expect(given.onToggle).not.toHaveBeenCalled()
    },
  )

  it.each(['starting', 'running'] as const)(
    'shows or hides the panel of a %s session and never starts another',
    (status) => {
      const given = input({ status, open: true })
      const toggle = testRunToggle(given)
      expect(toggle).toMatchObject({ label: 'Test run', pressed: true })
      expect(toggle.title).toContain('Hide')
      toggle.onClick()
      expect(given.onToggle).toHaveBeenCalledOnce()
      expect(given.onStart).not.toHaveBeenCalled()
    },
  )

  it('is off, with the reason as its title, where nothing is saved to run', () => {
    const toggle = testRunToggle(input({ blockedReason: 'Save the workflow first' }))
    expect(toggle).toMatchObject({
      disabled: true,
      pressed: false,
      title: 'Save the workflow first',
    })
  })
})
