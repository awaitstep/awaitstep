import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FieldGroup, FormField } from './form-field'
import { Input } from './input'
import { InputGroup } from './input-group'
import { Select } from './select'

// Labelled controls as the settings pages and dialogs lay them out.
const meta = {
  title: 'UI/FormField',
  decorators: [
    (Story) => (
      <div className="flex max-w-[520px] flex-col gap-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Plain: Story = {
  render: () => (
    <FormField label="Project name">
      <Input defaultValue="Project 101" />
    </FormField>
  ),
}

export const WithHint: Story = {
  render: () => (
    <FormField
      label="Name"
      hint="Letters, numbers and underscores. Workflows read it as global.env.STRIPE_KEY."
    >
      <Input defaultValue="STRIPE_KEY" />
    </FormField>
  ),
}

export const Optional: Story = {
  render: () => (
    <FormField label="Description" optional>
      <Input placeholder="What lives here?" />
    </FormField>
  ),
}

export const WithError: Story = {
  render: () => (
    <FormField
      label="Name"
      hint="Letters, numbers and underscores."
      error="STRIPE-KEY has a dash. Use STRIPE_KEY."
      required
    >
      <Input defaultValue="STRIPE-KEY" />
    </FormField>
  ),
}

export const WithSuccess: Story = {
  render: () => (
    <FormField
      label="URL"
      hint="Lowercase letters, numbers and dashes."
      success="project-101 is free."
    >
      <Input defaultValue="project-101" />
    </FormField>
  ),
}

export const UrlPrefix: Story = {
  render: () => (
    <FormField label="URL" hint="Changing it breaks bookmarked links to this project.">
      <InputGroup prefix="awaitstep.dev/acme/">
        <Input defaultValue="project-101" />
      </InputGroup>
    </FormField>
  ),
}

const EXPIRY_OPTIONS = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In 1 year' },
  { value: 'never', label: 'Never' },
]

function ExpirySelect() {
  const [value, setValue] = useState('30')
  return (
    <FormField label="Expires">
      <Select value={value} onValueChange={setValue} options={EXPIRY_OPTIONS} />
    </FormField>
  )
}

export const WithSelect: Story = {
  render: () => <ExpirySelect />,
}

export const Group: Story = {
  render: () => (
    <FieldGroup legend="Notifications" hint="Sent to the address on your account.">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" defaultChecked className="accent-primary" />
        Failed runs
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary" />
        Deploys
      </label>
    </FieldGroup>
  ),
}
