import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet'

// Today's bare sheet, as the run detail and deployment sheets use it. Kept here
// so a change to sheet.tsx that alters existing callers shows up beside SidePanel.
const meta = {
  title: 'UI/Sheet',
  component: SheetContent,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SheetContent>

export default meta

type Story = StoryObj<typeof meta>

export const Right: Story = {
  render: () => (
    <Sheet open>
      <SheetContent side="right" className="p-5">
        <SheetTitle className="text-base font-semibold">Run detail</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          send-welcome-email · started 2 minutes ago
        </SheetDescription>
      </SheetContent>
    </Sheet>
  ),
}

export const Left: Story = {
  render: () => (
    <Sheet open>
      <SheetContent side="left" className="p-5">
        <SheetTitle className="text-base font-semibold">Navigation</SheetTitle>
        <SheetDescription className="text-xs text-muted-foreground">
          The old mobile drawer.
        </SheetDescription>
      </SheetContent>
    </Sheet>
  ),
}
