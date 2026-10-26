import type { Meta, StoryObj } from '@storybook/react-vite'
import { Workflow } from 'lucide-react'
import { StatTile, Tile } from './tile'

const meta = {
  title: 'UI/Tile',
  component: Tile,
} satisfies Meta<typeof Tile>

export default meta

type Story = StoryObj<typeof meta>

const TONES = ['ok', 'fail', 'warn', 'info', 'neutral'] as const
const SIZES = ['sm', 'md', 'lg'] as const

export const TonesAndSizes: Story = {
  args: { children: <Workflow /> },
  render: () => (
    <div className="flex flex-col gap-3">
      {SIZES.map((size) => (
        <div key={size} className="flex items-center gap-3">
          {TONES.map((tone) => (
            <Tile key={tone} tone={tone} size={size}>
              <Workflow />
            </Tile>
          ))}
          <Tile size={size}>P</Tile>
        </div>
      ))}
    </div>
  ),
}

/** Main's header: two plain counts and a red link to what is failing. */
export const Stats: Story = {
  args: { children: null },
  render: () => (
    <div className="flex flex-wrap gap-2.5">
      <StatTile value={3} label="Projects" />
      <StatTile value={23} label="Workflows deployed" />
      <StatTile
        value={1}
        label="Failing now"
        tone="danger"
        href="/acme/project-101/sales/workflows"
      />
    </div>
  ),
}
