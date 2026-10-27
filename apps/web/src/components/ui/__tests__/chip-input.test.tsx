import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChipInput } from '../chip-input'
import { FormField } from '../form-field'

function Emails() {
  const [values, setValues] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  function commit(text: string) {
    const parts = text.split(/[\s,]+/).filter(Boolean)
    if (parts.length === 0) return
    setValues((v) => [...v, ...parts])
    setDraft('')
  }
  function remove(value: string) {
    setValues((v) => v.filter((x) => x !== value))
  }
  return (
    <FormField label="Email addresses" hint="Separate with commas">
      <ChipInput
        values={values}
        draft={draft}
        onDraftChange={setDraft}
        onCommit={commit}
        onRemove={remove}
      />
    </FormField>
  )
}

describe('ChipInput', () => {
  it('is the labelled, described control inside a FormField', () => {
    render(<Emails />)
    expect(screen.getByRole('textbox', { name: 'Email addresses' })).toHaveAccessibleDescription(
      'Separate with commas',
    )
  })

  it('commits on Enter and comma, and removes by button or Backspace', async () => {
    render(<Emails />)
    const input = screen.getByRole('textbox', { name: 'Email addresses' })
    await userEvent.type(input, 'a@x.test,b@x.test{enter}')
    expect(screen.getByRole('button', { name: 'Remove a@x.test' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Remove a@x.test' }))
    expect(screen.queryByText('a@x.test')).not.toBeInTheDocument()
    await userEvent.type(input, '{backspace}')
    expect(screen.queryByText('b@x.test')).not.toBeInTheDocument()
  })
})

describe('ChipInput paste', () => {
  it('pastes a fragment into what’s typed, and commits a pasted list with it', async () => {
    render(<Emails />)
    const input = screen.getByRole('textbox', { name: 'Email addresses' })
    await userEvent.type(input, 'sam@')
    await userEvent.paste('acme.test')
    expect(input).toHaveValue('sam@acme.test')
    await userEvent.clear(input)
    await userEvent.type(input, 'a@x.test')
    await userEvent.paste(', b@x.test')
    expect(screen.getByRole('button', { name: 'Remove a@x.test' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove b@x.test' })).toBeVisible()
  })
})

describe('FieldGroup error', () => {
  it('replaces the hint and marks the group invalid', async () => {
    const { FieldGroup } = await import('../form-field')
    render(
      <FieldGroup legend="Logo" hint="PNG or JPG" error="Pick an image under 200 KB">
        <button type="button">Upload</button>
      </FieldGroup>,
    )
    const group = screen.getByRole('group', { name: 'Logo' })
    expect(group).toHaveAccessibleDescription('Pick an image under 200 KB')
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('PNG or JPG')).not.toBeInTheDocument()
  })
})
