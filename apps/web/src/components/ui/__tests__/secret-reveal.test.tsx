import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecretReveal } from '../secret-reveal'
import { SAMPLE_SECRET } from './fixtures/access'

function renderReveal(onCopiedChange = vi.fn()) {
  render(
    <SecretReveal
      label="Your API key"
      value={SAMPLE_SECRET}
      warning="This is the only time AwaitStep shows the full key."
      onCopiedChange={onCopiedChange}
    />,
  )
  return onCopiedChange
}

describe('SecretReveal', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copies the full value, then says so', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const onCopiedChange = renderReveal()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(SAMPLE_SECRET)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
    expect(onCopiedChange).toHaveBeenCalledWith(true)
  })

  it('says when the copy failed and keeps "Copy"', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    const onCopiedChange = renderReveal()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't copy. Select the key and copy it yourself.",
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(onCopiedChange).not.toHaveBeenCalled()
  })

  it('selects the whole value when the field is focused', async () => {
    renderReveal()
    const input = screen.getByRole('textbox', { name: 'Your API key' }) as HTMLInputElement
    expect(input).toHaveAttribute('readonly')
    await userEvent.click(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(SAMPLE_SECRET.length)
  })

  it('shows the warning', () => {
    renderReveal()
    expect(
      screen.getByText('This is the only time AwaitStep shows the full key.'),
    ).toBeInTheDocument()
  })
})
