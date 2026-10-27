import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, KeyRound, Trash2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { BlockedAction } from './blocked-action'
import { Button, buttonVariants } from './button'
import { RadioCardGroup, type RadioCardOption } from './choice-card'
import { DangerRow, DangerZone } from './danger-zone'
import { FormField } from './form-field'
import { Input } from './input'
import { LockSwitch } from './lock-switch'
import { ModalDialog } from './modal-dialog'
import { ScopedSection } from './scoped-section'
import { SecretReveal } from './secret-reveal'
import { Select } from './select'
import { ShellLink } from './shell-link'
import { SwatchPicker } from './swatch-picker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
import { Tile } from './tile'
import { WorkspaceDot } from './workspace-dot'
import type { WorkspaceColour } from './workspace-colour'
import type { KeyLevel as GridLevel } from '../../types/dashboard/api-keys'
import { GrantSummary } from '../keys/parts/grant-summary'
import { describeReach, presetPermissions } from '../keys/parts/key-permissions'
import { PermissionGrid } from '../keys/parts/permission-grid'
import {
  KEY_LEVELS,
  PROJECT_ADMINS,
  PROJECT_KEYS,
  SALES_KEYS,
  SALES_MEMBERS,
  SAMPLE_SECRET,
  type KeyLevel,
} from './__tests__/fixtures/access'
import { KeyTable, MemberList } from './__tests__/fixtures/access-rows'

// The access blocks put together as the Access and CreateKey boards draw
// them, to compare side by side with the canvas.
// Temporary: each story is deleted by the page step that builds its board
// (WorkspaceSettings → P4; CreateKey → P6),
// see "Temporary composite stories" in plan/workspaces-w1.md.
const meta = {
  title: 'UI/Access screens',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const PROJECT_SETTINGS = '/acme/project-101/settings'

function WorkspaceGeneral() {
  const [colour, setColour] = useState<WorkspaceColour>('green')
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6">
        <FormField label="Name">
          <Input defaultValue="Sales" />
        </FormField>
        <FormField label="Description">
          <Input defaultValue="Lead handling and pipeline reports" />
        </FormField>
        <SwatchPicker value={colour} onChange={setColour} />
      </section>
      <DangerZone>
        <LockSwitch
          locked
          onChange={() => {}}
          inheritedFrom={{ name: 'Project 101', href: PROJECT_SETTINGS }}
          description="On, because Project 101 is locked, and that covers every workspace in it. A workspace can also be locked on its own while the project isn't: its admins and editors can do that here."
        />
        <DangerRow
          icon={<ArrowRight aria-hidden="true" />}
          title="Move workflows out"
          description="Send some or all of Sales's workflows and functions to another workspace in Project 101."
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
    </div>
  )
}

export const WorkspaceSettings: Story = {
  render: () => (
    <div className="flex max-w-[1080px] flex-col gap-6">
      <h1 className="text-2xl font-semibold">Workspace settings</h1>
      <Tabs defaultValue="general" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members 4</TabsTrigger>
          <TabsTrigger value="keys">API keys 2</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="max-w-[760px]">
          <WorkspaceGeneral />
        </TabsContent>
        <TabsContent value="members" className="flex flex-col gap-4">
          <ScopedSection
            kind="own"
            scopeLabel="Only in Sales"
            colour="green"
            hint="Can open Sales and nothing else in Project 101"
          >
            <MemberList members={SALES_MEMBERS} />
          </ScopedSection>
          <ScopedSection
            kind="inherited"
            scopeLabel="From Project 101"
            hint="Project members can open every workspace"
            manage={{ label: 'Manage in Project settings', href: PROJECT_SETTINGS }}
          >
            <MemberList members={PROJECT_ADMINS} inherited />
          </ScopedSection>
        </TabsContent>
        <TabsContent value="keys" className="flex flex-col gap-4">
          <ScopedSection
            kind="own"
            scopeLabel="Only in Sales"
            colour="green"
            hint="Reach Sales and nothing else"
          >
            <KeyTable keys={SALES_KEYS} />
          </ScopedSection>
          <ScopedSection
            kind="inherited"
            scopeLabel="From Project 101"
            hint="Project keys reach every workspace"
            manage={{ label: 'Manage in Project settings', href: `${PROJECT_SETTINGS}/keys` }}
          >
            <KeyTable keys={PROJECT_KEYS} inherited />
          </ScopedSection>
        </TabsContent>
      </Tabs>
    </div>
  ),
}

const LEVEL_OPTIONS: RadioCardOption<KeyLevel>[] = KEY_LEVELS.map((level) => ({
  ...level,
  leading: level.colour ? (
    <WorkspaceDot colour={level.colour} size="md" />
  ) : (
    <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-muted-foreground" />
  ),
}))

const EXPIRY_OPTIONS = [
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In 1 year' },
  { value: 'never', label: 'Never' },
]

// The fixtures' level ids are the kit's; the grid speaks the dashboard's.
const GRID_LEVEL: Record<KeyLevel, GridLevel> = {
  org: 'organization',
  project: 'project',
  workspace: 'workspace',
}

const GRANTED = presetPermissions('project', 'deploy-run')

function KeyForm() {
  const [level, setLevel] = useState<KeyLevel>('project')
  const [expiry, setExpiry] = useState('30')
  const [permissions, setPermissions] = useState(GRANTED)

  function handleLevelChange(next: KeyLevel) {
    setLevel(next)
    setPermissions(presetPermissions(GRID_LEVEL[next], next === 'org' ? 'read' : 'deploy-run'))
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
        <FormField label="Name">
          <Input defaultValue="CI deploys" />
        </FormField>
        <FormField label="Expires">
          <Select value={expiry} onValueChange={setExpiry} options={EXPIRY_OPTIONS} />
        </FormField>
      </div>
      <RadioCardGroup
        legend="What it reaches"
        layout="grid"
        value={level}
        onChange={handleLevelChange}
        options={LEVEL_OPTIONS}
      />
      <PermissionGrid
        level={GRID_LEVEL[level]}
        value={permissions}
        onChange={setPermissions}
        note={describeReach(GRID_LEVEL[level], { project: 'Project 101', workspace: 'Sales' })}
      />
    </div>
  )
}

function KeyRevealed({ onCopied }: { onCopied: (value: string) => void }) {
  return (
    <SecretReveal
      label="Your API key"
      value={SAMPLE_SECRET}
      warning="Copy it now and store it somewhere safe. This is the only time AwaitStep shows the full key. If you lose it, revoke it and create a new one."
      onCopied={onCopied}
    >
      <GrantSummary level="project" value={GRANTED} />
    </SecretReveal>
  )
}

function CreateKeyDialog({ initialStep }: { initialStep: 'form' | 'reveal' }) {
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState(initialStep)
  const [copiedValue, setCopiedValue] = useState<string | null>(null)
  const copied = copiedValue === SAMPLE_SECRET
  const revealing = step === 'reveal'

  function handleCreate() {
    setStep('reveal')
  }

  const footerHint = revealing ? (
    <span className={cn('text-2xs', copied ? 'text-status-success' : 'text-status-warning')}>
      {copied
        ? 'Key copied. You can close this.'
        : 'Copy the key before closing. It won’t be shown again.'}
    </span>
  ) : (
    <span className="text-2xs text-muted-foreground">4 permissions selected</span>
  )

  const actions = revealing ? (
    <Button onClick={() => setOpen(false)}>Done</Button>
  ) : (
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button onClick={handleCreate}>Create key</Button>
    </>
  )

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button variant="outline">Open dialog</Button>}
      leading={
        <Tile tone="warn" size="lg">
          <KeyRound />
        </Tile>
      }
      title="Create an API key"
      description="Give it only what it needs. You'll see the key once."
      footerStart={footerHint}
      actions={actions}
    >
      {revealing ? <KeyRevealed onCopied={setCopiedValue} /> : <KeyForm />}
    </ModalDialog>
  )
}

export const CreateKeyForm: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <CreateKeyDialog initialStep="form" />,
}

export const CreateKeyReveal: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <CreateKeyDialog initialStep="reveal" />,
}
