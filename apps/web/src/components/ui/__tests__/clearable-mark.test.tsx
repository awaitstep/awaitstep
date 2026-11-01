import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClearableMark } from '../clearable-mark'

describe('ClearableMark', () => {
  it('floats a named clear button over the image and calls back', async () => {
    const onClear = vi.fn()
    render(
      <ClearableMark hasImage onClear={onClear} clearLabel="Remove logo">
        <img alt="Acme logo" src="data:image/png;base64,AA" />
      </ClearableMark>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('hides the button when there is no image', () => {
    render(
      <ClearableMark hasImage={false} onClear={() => {}} clearLabel="Remove logo">
        <span>A</span>
      </ClearableMark>,
    )
    expect(screen.queryByRole('button', { name: 'Remove logo' })).toBeNull()
  })

  it('can be shown but not pressed while read-only or busy', () => {
    render(
      <ClearableMark hasImage disabled onClear={() => {}} clearLabel="Remove photo">
        <span>A</span>
      </ClearableMark>,
    )
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeDisabled()
  })
})
