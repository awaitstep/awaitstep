import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PickedScopes, type PickedScope } from './picked-scopes'
import { ScopeMultiPicker } from './scope-multi-picker'
import type { PickerProject } from './scope-picks'
import {
  CLOUDFLARE_PROJECTS,
  INVITE_PICKS,
  INVITE_PROJECTS,
} from './__tests__/fixtures/scope-picks'

// "Where they can work" from InvitePeople, and "Which projects may deploy with it"
// from ConnectCloudflare.
const meta = {
  title: 'Shell/ScopeMultiPicker',
  decorators: [
    (Story) => (
      <div className="max-w-[532px] pb-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function PickerDemo({
  projects,
  initial,
  defaultOpen,
  placeholder,
  addPlaceholder,
}: {
  projects: PickerProject[]
  initial: string[]
  defaultOpen?: boolean
  placeholder: string
  addPlaceholder: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <ScopeMultiPicker
      label="Where they can work"
      projects={projects}
      value={value}
      onChange={setValue}
      placeholder={placeholder}
      addPlaceholder={addPlaceholder}
      defaultOpen={defaultOpen}
    />
  )
}

const INVITE_COPY = {
  placeholder: 'Search projects and workspaces',
  addPlaceholder: 'Add a project or workspace',
}

export const OpenWithOnePick: Story = {
  render: () => (
    <PickerDemo projects={INVITE_PROJECTS} initial={['ws:p101:it']} defaultOpen {...INVITE_COPY} />
  ),
}

export const ProjectCoversWorkspaces: Story = {
  render: () => (
    <PickerDemo projects={INVITE_PROJECTS} initial={['p:p101']} defaultOpen {...INVITE_COPY} />
  ),
}

export const Closed: Story = {
  render: () => (
    <PickerDemo projects={INVITE_PROJECTS} initial={['ws:p101:it', 'p:data']} {...INVITE_COPY} />
  ),
}

export const ProjectsOnly: Story = {
  render: () => (
    <PickerDemo
      projects={CLOUDFLARE_PROJECTS}
      initial={['p:p101', 'p:internal']}
      defaultOpen
      placeholder={`Search ${CLOUDFLARE_PROJECTS.length} projects`}
      addPlaceholder="Add another project"
    />
  ),
}

function PicksDemo() {
  const [picks, setPicks] = useState<PickedScope[]>(INVITE_PICKS)
  function handleRoleChange(id: string, role: string) {
    setPicks((current) => current.map((pick) => (pick.id === id ? { ...pick, role } : pick)))
  }
  return (
    <PickedScopes
      label="Picked projects and workspaces"
      picks={picks}
      onRoleChange={handleRoleChange}
    />
  )
}

export const Picks: Story = {
  name: 'PickedScopes',
  render: () => <PicksDemo />,
}
