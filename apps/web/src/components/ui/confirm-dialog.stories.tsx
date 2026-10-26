import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { KeyRound, TriangleAlert, Trash2 } from 'lucide-react'
import { ConfirmDialog } from './confirm-dialog'

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onOpenChange: fn(), onConfirm: fn() },
} satisfies Meta<typeof ConfirmDialog>

export default meta

type Story = StoryObj<typeof meta>

/** Today's look, used by every existing caller. */
export const Default: Story = {
  args: {
    title: 'Delete workflow',
    description: 'This removes send-welcome-email and its run history. It cannot be undone.',
    confirmLabel: 'Delete',
  },
}

export const RevokeKey: Story = {
  args: {
    icon: KeyRound,
    title: 'Revoke CRM webhook?',
    description: 'Scripts and agents using this key stop working at once. This cannot be undone.',
    confirmLabel: 'Revoke key',
  },
}

export const DeleteProject: Story = {
  args: {
    icon: Trash2,
    title: 'Delete Project 101?',
    description:
      "This removes Sales, IT and Support, 8 workflows and all their history. It can't be undone.",
    confirmLabel: 'Delete project',
    confirmText: 'Project 101',
  },
}

export const Warning: Story = {
  args: {
    icon: TriangleAlert,
    variant: 'warning',
    title: 'Turn off the deletion lock?',
    description:
      'Project 101 and its workspaces can be deleted again until someone turns it back on.',
    confirmLabel: 'Turn off',
  },
}
