import type { Meta, StoryObj } from '@storybook/react-vite'
import { ClearableMark } from './clearable-mark'

const meta = {
  title: 'UI/ClearableMark',
  component: ClearableMark,
  args: { clearLabel: 'Remove logo', onClear: () => {}, hasImage: true },
} satisfies Meta<typeof ClearableMark>

export default meta

type Story = StoryObj<typeof meta>

const mark = (
  <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
    A
  </span>
)

export const WithLogo: Story = { args: { children: mark } }

export const InitialOnly: Story = { args: { children: mark, hasImage: false } }
