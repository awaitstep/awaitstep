import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './button'
import { Input } from './input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'

// Today's bare dialog, as the IDE's file dialogs use it. Kept here so a change
// to dialog.tsx that alters existing callers shows up beside the new layouts.
const meta = {
  title: 'UI/Dialog',
  component: DialogContent,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DialogContent>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>Path relative to the project root.</DialogDescription>
        </DialogHeader>
        <Input defaultValue="lib/format-date.ts" aria-label="Path" />
        <DialogFooter>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button size="sm">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
