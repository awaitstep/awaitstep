import type { Meta, StoryObj } from '@storybook/react-vite'
import { PillTab, PillTabsList } from './pill-tabs'
import { Tabs } from './tabs'

// The boards' pill tabs with counts: workspace settings (`Access`) and Resources.
const meta = {
  title: 'UI/Pill tabs',
  component: PillTabsList,
} satisfies Meta<typeof PillTabsList>

export default meta

type Story = StoryObj<typeof meta>

export const WithCounts: Story = {
  args: { children: null },
  render: () => (
    <Tabs defaultValue="nodes">
      <PillTabsList>
        <PillTab value="nodes" count={6}>
          Nodes
        </PillTab>
        <PillTab value="variables" count={3}>
          Variables
        </PillTab>
        <PillTab value="general">General</PillTab>
      </PillTabsList>
    </Tabs>
  ),
}
