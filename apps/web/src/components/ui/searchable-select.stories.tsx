import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SearchableSelect, type SearchableOption } from './searchable-select'

// The Resources Nodes tab's Category select.
const OPTIONS: SearchableOption<string>[] = [
  { value: 'All', label: 'All', count: 24 },
  { value: 'AI', label: 'AI', count: 5 },
  { value: 'Data', label: 'Data', count: 7 },
  { value: 'Messaging', label: 'Messaging', count: 6 },
  { value: 'Payments', label: 'Payments', count: 3 },
  { value: 'Storage', label: 'Storage', count: 3 },
]

const meta = { title: 'UI/SearchableSelect' } satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Category() {
  const [value, setValue] = useState('All')
  return (
    <SearchableSelect
      label="Category"
      value={value}
      onChange={setValue}
      options={OPTIONS}
      searchPlaceholder="Search categories"
      emptyText="No category matches."
    />
  )
}

export const CategoryFilter: Story = { render: () => <Category /> }
