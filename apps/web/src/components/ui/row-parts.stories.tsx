import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AvatarStack } from './avatar-stack'
import { RunHistoryBars } from './run-history-bars'
import { ShareToggle } from './share-toggle'
import { PEOPLE, SALES_WORKFLOWS } from './__tests__/fixtures/lists'

// The small parts that sit at the right end of list rows and cards.
const meta = {
  title: 'UI/RowParts',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const AvatarStacks: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <AvatarStack people={PEOPLE.slice(0, 2)} />
      <AvatarStack people={PEOPLE.slice(0, 3)} />
      <AvatarStack people={PEOPLE} />
    </div>
  ),
}

export const RunHistory: Story = {
  render: () => (
    <div className="flex w-[150px] flex-col gap-4">
      {SALES_WORKFLOWS.map((workflow) => (
        <RunHistoryBars key={workflow.id} runs={workflow.runs} />
      ))}
    </div>
  ),
}

function ShareDemo({ initial, disabledReason }: { initial: boolean; disabledReason?: string }) {
  const [shared, setShared] = useState(initial)
  return (
    <ShareToggle
      shared={shared}
      onChange={setShared}
      label="Share Lead enrichment with Project 101"
      disabledReason={disabledReason}
    />
  )
}

export const ShareToggles: Story = {
  render: () => (
    <div className="flex w-[140px] flex-col items-end gap-4">
      <ShareDemo initial />
      <ShareDemo initial={false} />
      <ShareDemo initial disabledReason="Viewers can't change sharing" />
    </div>
  ),
}
