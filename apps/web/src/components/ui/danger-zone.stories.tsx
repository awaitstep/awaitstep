import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, Trash2 } from 'lucide-react'
import { BlockedAction } from './blocked-action'
import { Button, buttonVariants } from './button'
import { DangerRow, DangerZone } from './danger-zone'
import { LockSwitch } from './lock-switch'
import { ShellLink } from './shell-link'
import { Switch } from './switch'
import { LOCK_SET_BY } from './__tests__/fixtures/access'
import { MOVE_PROJECT_COPY } from '../project-settings/move-project-copy'

// The foot of ProjectGeneral and of Access › General, plus the switch they share.
const meta = {
  title: 'UI/DangerZone',
  decorators: [
    (Story) => (
      <div className="max-w-[760px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const PROJECT_LOCK_TEXT = {
  on: "On. Project 101 and its workspaces can't be deleted until a project admin or org owner turns this off.",
  off: 'Off. Turn on to stop Project 101 and its workspaces from being deleted by mistake. Project admins and org owners can change this.',
}

function ProjectDangerZone({ initiallyLocked }: { initiallyLocked: boolean }) {
  const [locked, setLocked] = useState(initiallyLocked)
  return (
    <DangerZone>
      <LockSwitch
        locked={locked}
        onChange={setLocked}
        description={locked ? PROJECT_LOCK_TEXT.on : PROJECT_LOCK_TEXT.off}
        setBy={LOCK_SET_BY}
      />
      <DangerRow
        icon={<ArrowRight aria-hidden="true" />}
        title="Move to another organization"
        description={MOVE_PROJECT_COPY}
        action={
          <Button variant="outline" size="sm">
            Move project
          </Button>
        }
      />
      <DangerRow
        icon={<Trash2 aria-hidden="true" />}
        tone="danger"
        title="Delete this project"
        description="Deletes 3 workspaces, 8 workflows, their run history and every project key. Deployed workers keep running on Cloudflare until you remove them."
        action={
          <BlockedAction reason={locked ? 'Turn off the deletion lock first' : undefined}>
            <Button variant="outline" size="sm" className="border-destructive/40 text-status-error">
              Delete project
            </Button>
          </BlockedAction>
        }
      />
    </DangerZone>
  )
}

export const ProjectLocked: Story = {
  render: () => <ProjectDangerZone initiallyLocked />,
}

export const ProjectUnlocked: Story = {
  render: () => <ProjectDangerZone initiallyLocked={false} />,
}

export const WorkspaceInheritedLock: Story = {
  render: () => (
    <DangerZone>
      <LockSwitch
        locked
        onChange={() => {}}
        inheritedFrom={{ name: 'Project 101', href: '/acme/project-101/settings' }}
        description="On because Project 101 is locked, which covers every workspace in it. Manage the lock in the project."
      />
      <DangerRow
        icon={<ArrowRight aria-hidden="true" />}
        title="Move workflows out"
        description="Move workflows and functions to another workspace in Project 101."
        action={
          <ShellLink
            href="/acme/project-101/sales/move"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Move workflows
          </ShellLink>
        }
      />
      <DangerRow
        icon={<Trash2 aria-hidden="true" />}
        tone="danger"
        title="Delete this workspace"
        description="Deletes 4 workflows, 2 functions and their run history. Blocked while other workspaces call its shared workflows. A project's last workspace can't be deleted."
        action={
          <BlockedAction reason="Locked by Project 101">
            <Button variant="outline" size="sm">
              Delete Sales
            </Button>
          </BlockedAction>
        }
      />
    </DangerZone>
  ),
}

export const LockWithoutPermission: Story = {
  render: () => (
    <DangerZone>
      <LockSwitch
        locked
        onChange={() => {}}
        description={PROJECT_LOCK_TEXT.on}
        setBy={LOCK_SET_BY}
        disabledReason="Only project admins and org owners can change this"
      />
    </DangerZone>
  ),
}

function SwitchDemo({ tone, disabledReason }: { tone?: 'warn'; disabledReason?: string }) {
  const [checked, setChecked] = useState(true)
  return (
    <Switch
      checked={checked}
      onCheckedChange={setChecked}
      label="Demo switch"
      tone={tone}
      disabledReason={disabledReason}
    />
  )
}

export const Switches: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <SwitchDemo />
      <SwitchDemo tone="warn" />
      <SwitchDemo disabledReason="Viewers can't change this" />
    </div>
  ),
}
