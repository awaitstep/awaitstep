import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './avatar'
import { Button } from './button'
import { SidePanel } from './side-panel'

type DemoProps = Omit<ComponentProps<typeof SidePanel>, 'open' | 'onOpenChange' | 'trigger'>

// Opens on load; closing it leaves the trigger, so focus return can be tried.
function Demo(props: DemoProps) {
  const [open, setOpen] = useState(true)
  return (
    <SidePanel
      {...props}
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">Open panel</Button>}
    />
  )
}

const meta = {
  title: 'UI/SidePanel',
  component: Demo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Demo>

export default meta

type Story = StoryObj<typeof meta>

const ROLE_ROWS = ['Project 101', 'Marketing Site', 'Internal Tools']

export const AccessEditor: Story = {
  args: {
    leading: <Avatar name="Daniel Kim" className="size-11 text-sm" />,
    title: 'Daniel Kim',
    description: 'daniel@acme.test · joined 3 Sep',
    footerStart: (
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        Remove from Acme Inc
      </Button>
    ),
    actions: (
      <>
        <Button variant="outline">Cancel</Button>
        <Button>Save access</Button>
      </>
    ),
    children: (
      <>
        <h3 className="text-xs font-semibold">Projects and workspaces</h3>
        {ROLE_ROWS.map((name) => (
          <div
            key={name}
            className="flex items-center justify-between rounded-xl border border-border px-3.5 py-3 text-xs"
          >
            {name}
            <span className="text-muted-foreground">No project role</span>
          </div>
        ))}
      </>
    ),
  },
}

export const LongBody: Story = {
  args: {
    ...AccessEditor.args,
    title: 'Priya Shah',
    description: 'priya@acme.test · joined 14 Aug',
    children: (
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="rounded-lg border border-border px-3 py-2.5 text-xs">
            Workspace {i + 1}
          </li>
        ))}
      </ul>
    ),
  },
}
