import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyIconButton } from '../copy-icon-button'
import type * as Utils from '../../../lib/utils'

const copied = vi.hoisted(() => ({ value: null as string | null, fail: false }))
vi.mock('../../../lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  copyToClipboard: async (value: string) => {
    if (copied.fail) throw new Error('denied')
    copied.value = value
  },
}))

afterEach(() => {
  copied.value = null
  copied.fail = false
})

describe('CopyIconButton', () => {
  it('copies the value and says so', async () => {
    render(<CopyIconButton value="16906129-77aa" label="Instance ID" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy the instance id' }))
    expect(copied.value).toBe('16906129-77aa')
    expect(await screen.findByText('Copied', { selector: '[aria-live]' })).toBeInTheDocument()
  })

  it('says when the clipboard refused', async () => {
    copied.fail = true
    render(<CopyIconButton value="x" label="Instance ID" />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy the instance id' }))
    expect(
      await screen.findByText('Couldn’t copy', { selector: '[aria-live]' }),
    ).toBeInTheDocument()
  })
})
