import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckboxCard, RadioCardGroup, type RadioCardOption } from './choice-card'
import { SwatchPicker } from './swatch-picker'
import { WorkspaceDot } from './workspace-dot'
import type { WorkspaceColour } from './workspace-colour'
import {
  KEY_LEVELS,
  WORKSPACE_ACCESS,
  type KeyLevel,
  type WorkspaceAccess,
} from './__tests__/fixtures/access'
import { PickedPeople } from './__tests__/fixtures/picked-people'

// Choices drawn as cards and swatches, from NewWorkspace, CreateKey and NewVariable.
const meta = {
  title: 'UI/Choices',
  decorators: [
    (Story) => (
      <div className="flex max-w-[560px] flex-col gap-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function renderAccessExtra(value: WorkspaceAccess) {
  return value === 'pick' ? <PickedPeople /> : null
}

function AccessDemo() {
  const [value, setValue] = useState<WorkspaceAccess>('pick')
  return (
    <RadioCardGroup
      legend="Who can get in"
      value={value}
      onChange={setValue}
      options={WORKSPACE_ACCESS}
      renderExtra={renderAccessExtra}
    />
  )
}

export const Stacked: Story = {
  render: () => <AccessDemo />,
}

const LEVEL_OPTIONS: RadioCardOption<KeyLevel>[] = KEY_LEVELS.map((level) => ({
  ...level,
  leading: level.colour ? (
    <WorkspaceDot colour={level.colour} size="md" />
  ) : (
    <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-muted-foreground" />
  ),
}))

function LevelDemo() {
  const [value, setValue] = useState<KeyLevel>('project')
  return (
    <RadioCardGroup
      legend="Where it works"
      layout="grid"
      value={value}
      onChange={setValue}
      options={LEVEL_OPTIONS}
    />
  )
}

export const Grid: Story = {
  render: () => <LevelDemo />,
}

function SecretDemo({ initial }: { initial: boolean }) {
  const [checked, setChecked] = useState(initial)
  return (
    <CheckboxCard
      checked={checked}
      onChange={setChecked}
      title="Secret"
      description="Hidden after saving; workflows can still read it"
    />
  )
}

export const Checkbox: Story = {
  render: () => (
    <>
      <SecretDemo initial />
      <SecretDemo initial={false} />
    </>
  ),
}

function SwatchDemo({ initial }: { initial: WorkspaceColour }) {
  const [colour, setColour] = useState(initial)
  return <SwatchPicker value={colour} onChange={setColour} />
}

export const Swatches: Story = {
  render: () => (
    <>
      <SwatchDemo initial="green" />
      <SwatchDemo initial="blue" />
      <SwatchDemo initial="amber" />
      <SwatchDemo initial="purple" />
      <SwatchDemo initial="rose" />
    </>
  ),
}
