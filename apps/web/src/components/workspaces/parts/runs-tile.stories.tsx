import type { Meta, StoryObj } from '@storybook/react-vite'
import type { RunHour } from '../../../types/dashboard/workspaces'
import { RunsTile } from './runs-tile'

// WsOverview's Runs tile, the third of its four tiles.
const meta = {
  title: 'Workspaces/RunsTile',
  component: RunsTile,
  decorators: [
    (Story) => (
      <div className="grid max-w-[520px] grid-cols-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RunsTile>

export default meta

type Story = StoryObj<typeof meta>

const BUSY = [4, 6, 3, 7, 9, 5, 8, 12, 10, 6, 4, 3, 5, 8, 11, 14, 9, 7, 6, 8, 10, 12, 9, 6]
const FAILED_AT: Record<number, number> = { 15: 2, 21: 1, 23: 1 }

const hours: RunHour[] = BUSY.map((runs, i) => {
  const failed = FAILED_AT[i] ?? 0
  return { runs, complete: runs - failed, failed }
})

export const Active: Story = {
  args: { runs: BUSY.reduce((sum, n) => sum + n, 0), hours, href: '#runs' },
}

export const NoRunsToday: Story = {
  args: {
    runs: 0,
    hours: Array.from({ length: 24 }, () => ({ runs: 0, complete: 0, failed: 0 })),
    href: '#runs',
  },
}
