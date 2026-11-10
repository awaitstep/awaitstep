import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalTestPanel } from '../local-test-panel'
import { useLocalTestStore } from '../../../stores/local-test-store'

const stop = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../hooks/use-local-dev', () => ({
  useLocalDev: () => ({
    state: 'running',
    info: { port: 8787, url: 'http://localhost:8787' },
    error: null,
    warnings: [],
    triggerError: null,
    triggerResult: null,
    instanceId: null,
    instanceStatus: null,
    isTriggering: false,
    logs: [],
    start: vi.fn(),
    stop,
    trigger: vi.fn(),
    refresh: vi.fn(),
  }),
}))

beforeEach(() => {
  stop.mockClear()
  useLocalTestStore.setState({
    open: true,
    mode: 'canvas',
    workflowId: 'wf-1',
    triggerInput: '{}',
    closeRequested: 0,
  })
})

describe('LocalTestPanel close', () => {
  it('asks whether to keep the server running or stop it', async () => {
    const user = userEvent.setup()
    render(<LocalTestPanel workflowId="wf-1" />)
    await user.click(screen.getByTitle('Close'))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Keep the local server running?')).toBeInTheDocument()
    expect(stop).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Keep running' }))
    expect(useLocalTestStore.getState().open).toBe(false)
    expect(stop).not.toHaveBeenCalled()
  })

  it('stops the server when asked', async () => {
    const user = userEvent.setup()
    render(<LocalTestPanel workflowId="wf-1" />)
    await user.click(screen.getByTitle('Close'))
    await user.click(await screen.findByRole('button', { name: 'Stop server' }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(useLocalTestStore.getState().open).toBe(false)
  })
})
