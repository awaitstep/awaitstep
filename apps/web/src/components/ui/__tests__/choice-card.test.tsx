import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckboxCard, RadioCardGroup } from '../choice-card'
import { SwatchPicker } from '../swatch-picker'
import type { WorkspaceColour } from '../workspace-colour'
import { WORKSPACE_ACCESS, type WorkspaceAccess } from './fixtures/access'

function renderPeoplePicker(picked: WorkspaceAccess) {
  return picked === 'pick' ? <span>People picker</span> : null
}

function AccessGroup({ onChange }: { onChange: (value: WorkspaceAccess) => void }) {
  const [value, setValue] = useState<WorkspaceAccess>('admins')
  function handleChange(next: WorkspaceAccess) {
    setValue(next)
    onChange(next)
  }
  return (
    <RadioCardGroup
      legend="Who can get in"
      value={value}
      onChange={handleChange}
      options={WORKSPACE_ACCESS}
      renderExtra={renderPeoplePicker}
    />
  )
}

describe('RadioCardGroup', () => {
  it('is a group named by its legend with one radio per option', () => {
    render(<AccessGroup onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Who can get in' })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Only project admins for now' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Choose people now' })).toHaveAccessibleDescription(
      "They'll see Support and nothing else in Project 101",
    )
  })

  it('moves the choice with the arrow keys and reports it', async () => {
    const onChange = vi.fn()
    render(<AccessGroup onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Only project admins for now' }))
    await userEvent.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('pick')
    expect(screen.getByRole('radio', { name: 'Choose people now' })).toBeChecked()
  })

  it('shows the extra content only under the picked option', async () => {
    render(<AccessGroup onChange={vi.fn()} />)
    expect(screen.queryByText('People picker')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Choose people now'))
    expect(screen.getByText('People picker')).toBeInTheDocument()
  })
})

describe('CheckboxCard', () => {
  it('is a checkbox named by its title and described by its detail', async () => {
    const onChange = vi.fn()
    render(
      <CheckboxCard
        checked={false}
        onChange={onChange}
        title="Secret"
        description="Hidden after saving"
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Secret' })
    expect(checkbox).toHaveAccessibleDescription('Hidden after saving')
    checkbox.focus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

function Swatches({ onChange }: { onChange: (colour: WorkspaceColour) => void }) {
  const [colour, setColour] = useState<WorkspaceColour>('green')
  function handleChange(next: WorkspaceColour) {
    setColour(next)
    onChange(next)
  }
  return <SwatchPicker value={colour} onChange={handleChange} />
}

describe('SwatchPicker', () => {
  it('offers the five colours by name, one checked', () => {
    render(<Swatches onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Colour' })
    const radios = within(group).getAllByRole('radio')
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Green',
      'Blue',
      'Amber',
      'Purple',
      'Rose',
    ])
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Green' })).toBeChecked()
  })

  it('moves between colours with the arrow keys', async () => {
    const onChange = vi.fn()
    render(<Swatches onChange={onChange} />)
    screen.getByRole('radio', { name: 'Green' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('blue')
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked()
  })
})
