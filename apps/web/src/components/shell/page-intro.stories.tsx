import type { Meta, StoryObj } from '@storybook/react-vite'
import { PageIntro } from './page-intro'

const meta = {
  title: 'Shell/PageIntro',
  component: PageIntro,
} satisfies Meta<typeof PageIntro>

export default meta

type Story = StoryObj<typeof meta>

export const Plain: Story = {
  args: {
    title: 'General',
    description: "Project 101's name and address, and the actions that can't be undone.",
  },
}

function StatPlaceholder({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex min-w-[110px] flex-col gap-0.5 rounded-xl border border-border bg-card px-4 py-2.5">
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </span>
  )
}

export const WithAside: Story = {
  args: {
    title: 'Projects',
    description: 'Everything in Acme Inc. Open a project to work in one of its workspaces.',
    aside: (
      <>
        <StatPlaceholder value="3" label="Projects" />
        <StatPlaceholder value="23" label="Workflows deployed" />
      </>
    ),
  },
}
