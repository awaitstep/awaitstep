import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldGroup, FormField } from '../form-field'
import { Input } from '../input'
import { InputGroup } from '../input-group'
import { Select } from '../select'

describe('FormField', () => {
  it('names the control by its label', () => {
    render(
      <FormField label="Project name">
        <Input defaultValue="Project 101" />
      </FormField>,
    )
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Project 101')
  })

  it('describes the control with its hint and leaves it valid', () => {
    render(
      <FormField label="Name" hint="Letters, numbers and underscores.">
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription('Letters, numbers and underscores.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows the error in place of the hint and marks the control invalid', () => {
    render(
      <FormField label="Name" hint="Letters only." error="Use STRIPE_KEY." required>
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription('Use STRIPE_KEY.')
    expect(screen.queryByText('Letters only.')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toBeRequired()
  })

  it('shows the success message in place of the hint and leaves the control valid', () => {
    render(
      <FormField label="URL" hint="Lowercase and dashes." success="project-101 is free.">
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'URL' })
    expect(input).toHaveAccessibleDescription('project-101 is free.')
    expect(screen.queryByText('Lowercase and dashes.')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('prefers the error over the success message', () => {
    render(
      <FormField label="URL" success="project-101 is free." error="project-101 is taken.">
        <Input />
      </FormField>,
    )
    expect(screen.getByRole('textbox', { name: 'URL' })).toHaveAccessibleDescription(
      'project-101 is taken.',
    )
    expect(screen.queryByText('project-101 is free.')).not.toBeInTheDocument()
  })

  it('brings the hint back once the error is cleared', () => {
    const { rerender } = render(
      <FormField label="Name" hint="Letters only." error="Use STRIPE_KEY.">
        <Input />
      </FormField>,
    )
    rerender(
      <FormField label="Name" hint="Letters only.">
        <Input />
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription('Letters only.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('shows "Optional" after the label', () => {
    render(
      <FormField label="Description" optional>
        <Input />
      </FormField>,
    )
    expect(screen.getByText('Optional')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Description/ })).toBeInTheDocument()
  })

  it('keeps an id the caller gives', () => {
    render(
      <FormField label="Name" id="workspace-name">
        <Input />
      </FormField>,
    )
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('id', 'workspace-name')
  })

  it('labels a Select through its trigger', () => {
    render(
      <FormField label="Expires" hint="Keys can be renewed.">
        <Select
          value="30"
          onValueChange={vi.fn()}
          options={[{ value: '30', label: 'In 30 days' }]}
        />
      </FormField>,
    )
    expect(screen.getByRole('combobox', { name: 'Expires' })).toHaveAccessibleDescription(
      'Keys can be renewed.',
    )
  })
})

describe('InputGroup', () => {
  it('puts the prefix in the description, not the name', () => {
    render(
      <FormField label="URL" hint="Changing it breaks links.">
        <InputGroup prefix="awaitstep.dev/acme/">
          <Input defaultValue="project-101" />
        </InputGroup>
      </FormField>,
    )
    const input = screen.getByRole('textbox', { name: 'URL' })
    expect(screen.getByText('awaitstep.dev/acme/')).toBeVisible()
    expect(input).toHaveAccessibleDescription('awaitstep.dev/acme/ Changing it breaks links.')
  })
})

describe('FieldGroup', () => {
  it('is a group named by its legend and described by its hint', () => {
    render(
      <FieldGroup legend="Colour" hint="Shown beside the workspace's name.">
        <input type="checkbox" aria-label="Green" />
      </FieldGroup>,
    )
    expect(screen.getByRole('group', { name: 'Colour' })).toHaveAccessibleDescription(
      "Shown beside the workspace's name.",
    )
  })
})
