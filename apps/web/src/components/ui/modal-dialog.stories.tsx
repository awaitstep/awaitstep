import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Info, KeyRound } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { ModalDialog } from './modal-dialog'
import { WORKSPACE_COLOURS, WORKSPACE_TILE_CLASS } from './workspace-colour'

type DemoProps = Omit<ComponentProps<typeof ModalDialog>, 'open' | 'onOpenChange' | 'trigger'>

// Opens on load; closing it leaves the trigger, so focus return can be tried.
function Demo(props: DemoProps) {
  const [open, setOpen] = useState(true)
  return (
    <ModalDialog
      {...props}
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">Open dialog</Button>}
    />
  )
}

const meta = {
  title: 'UI/ModalDialog',
  component: Demo,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Demo>

export default meta

type Story = StoryObj<typeof meta>

function CancelAndPrimary({ primary }: { primary: string }) {
  return (
    <>
      <Button variant="outline">Cancel</Button>
      <Button>{primary}</Button>
    </>
  )
}

function SwatchRow() {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-xs font-medium text-foreground/80">Colour</legend>
      <span className="flex gap-2.5">
        {WORKSPACE_COLOURS.map((colour, i) => (
          <button
            key={colour}
            type="button"
            aria-label={colour}
            aria-pressed={i === 2}
            className={cn(
              'size-8 rounded-lg border-2',
              WORKSPACE_TILE_CLASS[colour],
              i === 2 ? 'border-foreground' : 'border-transparent',
            )}
          />
        ))}
      </span>
    </fieldset>
  )
}

export const NewWorkspace: Story = {
  args: {
    leading: (
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-xl text-base font-semibold',
          WORKSPACE_TILE_CLASS.amber,
        )}
      >
        S
      </span>
    ),
    title: 'Create a workspace',
    description: 'A separate space in Project 101 with its own people, keys and workflows.',
    actions: <CancelAndPrimary primary="Create workspace" />,
    children: (
      <>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nw-name">Name</Label>
          <Input id="nw-name" defaultValue="Support" />
        </div>
        <SwatchRow />
      </>
    ),
  },
}

export const WithFooterHint: Story = {
  args: {
    leading: (
      <span className="flex size-11 items-center justify-center rounded-xl bg-tone-info text-status-info">
        <KeyRound className="size-5" aria-hidden="true" />
      </span>
    ),
    title: 'Create a project key',
    description: 'For scripts and agents that work across Project 101.',
    footerStart: (
      <>
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        The key is shown once, right after you create it.
      </>
    ),
    actions: <CancelAndPrimary primary="Create key" />,
    children: (
      <div className="flex flex-col gap-2">
        <Label htmlFor="ck-name">Name</Label>
        <Input id="ck-name" placeholder="CRM webhook" />
      </div>
    ),
  },
}

export const LongBody: Story = {
  args: {
    title: 'Move workflows',
    description: 'Pick the workflows to move from Sales to IT.',
    actions: <CancelAndPrimary primary="Move 24 workflows" />,
    children: (
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 24 }, (_, i) => (
          <li key={i} className="rounded-lg border border-border px-3 py-2.5 text-xs">
            workflow-{i + 1}
          </li>
        ))}
      </ul>
    ),
  },
}
