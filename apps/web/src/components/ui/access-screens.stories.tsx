import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { KeyRound } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'
import { RadioCardGroup, type RadioCardOption } from './choice-card'
import { FormField } from './form-field'
import { Input } from './input'
import { ModalDialog } from './modal-dialog'
import { SecretReveal } from './secret-reveal'
import { Select } from './select'
import { Tile } from './tile'
import { WorkspaceDot } from './workspace-dot'
import type { KeyLevel as GridLevel } from '../../types/dashboard/api-keys'
import { GrantSummary } from '../keys/parts/grant-summary'
import { describeReach, presetPermissions } from '../keys/parts/key-permissions'
import { PermissionGrid } from '../keys/parts/permission-grid'
import { KEY_LEVELS, SAMPLE_SECRET, type KeyLevel } from './__tests__/fixtures/access'

// The access blocks put together as the CreateKey board draws them, to
// compare side by side with the canvas.
// Temporary: deleted by the page step that builds its board (CreateKey → P6),
// see "Temporary composite stories" in plan/workspaces-w1.md.
const meta = {
  title: 'UI/Access screens',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

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
