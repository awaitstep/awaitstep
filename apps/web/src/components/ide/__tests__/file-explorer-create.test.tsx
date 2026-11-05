import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateRow, type CreateRowProps } from '../file-explorer-create'

const existing = ['lib/retry.ts', 'lib/payments/charge.ts']

function setup(props: Partial<CreateRowProps> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true)
  const onCancel = vi.fn()
  render(
    <CreateRow
      mode="file"
      target="lib"
      existing={existing}
      depth={1}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCancel, input: screen.getByRole('textbox') }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('new file row', () => {
  it('shows the folder it will create in', () => {
    setup()
    expect(screen.getByText('In lib/')).toBeInTheDocument()
  })

  it('creates inside the target for a bare name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup()
    await user.type(input, 'sleep.ts{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('lib/sleep.ts')
  })

  it('lets a typed path win over the target', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup()
    await user.type(input, 'config/env.ts')
    expect(screen.getByText('In config/')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('config/env.ts')
  })

  it('refuses a compile collision once typing pauses, and Enter does nothing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup()
    await user.type(input, 'retry.js')
    expect(screen.queryByText(/would overwrite/)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'lib/retry.js would overwrite lib/retry.ts after compile',
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await user.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('announces the refusal straight away when Enter is pressed on an invalid name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup()
    await user.type(input, 'retry.ts{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('lib/retry.ts already exists')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not create on Enter with an empty name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup()
    await user.type(input, '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Esc cancels', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onCancel, input } = setup()
    await user.type(input, 'abc{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows the file-limit reason and blocks Enter', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup({ blockedReason: 'The project has 100 files.' })
    await user.type(input, 'a.ts{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('The project has 100 files.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps a Folder… path inside the target', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { onSubmit, input } = setup({ mode: 'folder' })
    await user.type(input, 'billing/index.ts{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('lib/billing/index.ts')
  })

  it('starts from the prompt it was given', () => {
    const { input } = setup({ initial: 'handlers/queue/' })
    expect(input).toHaveValue('handlers/queue/')
  })
})
