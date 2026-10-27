import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChipInput } from './chip-input'
import { FormField } from './form-field'

// InvitePeople's email field.
function Demo({ initial, error }: { initial: string[]; error?: string }) {
  const [values, setValues] = useState(initial)
  const [draft, setDraft] = useState('')
  function commit(text: string) {
    const parts = text.split(/[\s,;]+/).filter(Boolean)
    if (parts.length === 0) return
    setValues((v) => [...new Set([...v, ...parts])])
    setDraft('')
  }
  function remove(value: string) {
    setValues((v) => v.filter((x) => x !== value))
  }
  return (
    <div className="max-w-[520px]">
      <FormField label="Email addresses" hint="Separate with commas or paste a list." error={error}>
        <ChipInput
          values={values}
          draft={draft}
          onDraftChange={setDraft}
          onCommit={commit}
          onRemove={remove}
          placeholder="Add another"
        />
      </FormField>
    </div>
  )
}

const meta = {
  title: 'UI/ChipInput',
  component: Demo,
} satisfies Meta<typeof Demo>

export default meta

type Story = StoryObj<typeof meta>

export const Emails: Story = { args: { initial: ['sam@acme.test', 'joy@acme.test'] } }

export const Empty: Story = { args: { initial: [] } }

export const WithError: Story = {
  args: { initial: ['sam@acme.test'], error: 'sam@acme.test is already invited' },
}
