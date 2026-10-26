import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { KeyLevel, KeyPermissions } from '../../../types/dashboard/api-keys'
import { GrantSummary } from './grant-summary'
import { describeGrantCount, describeReach, presetPermissions } from './key-permissions'
import { PermissionGrid } from './permission-grid'

// The grid from CreateKey, CreateKeyOrg and CreateKeyWorkspace.
const meta = {
  title: 'Keys/PermissionGrid',
  decorators: [
    (Story) => (
      <div className="max-w-[672px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const NAMES = { project: 'Project 101', workspace: 'Sales' }

function GridDemo({ level, initial }: { level: KeyLevel; initial: KeyPermissions }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="flex flex-col gap-3">
      <PermissionGrid
        level={level}
        value={value}
        onChange={setValue}
        note={describeReach(level, NAMES)}
      />
      <span className="text-2xs text-muted-foreground">{describeGrantCount(level, value)}</span>
    </div>
  )
}

export const ProjectDeployAndRun: Story = {
  render: () => <GridDemo level="project" initial={presetPermissions('project', 'deploy-run')} />,
}

export const OrganizationReadOnly: Story = {
  render: () => (
    <GridDemo level="organization" initial={presetPermissions('organization', 'read')} />
  ),
}

export const WorkspaceFullAccess: Story = {
  render: () => <GridDemo level="workspace" initial={presetPermissions('workspace', 'full')} />,
}

export const Custom: Story = {
  render: () => (
    <GridDemo level="workspace" initial={{ workflows: ['read', 'run'], runs: ['read'] }} />
  ),
}

export const Empty: Story = {
  render: () => <GridDemo level="workspace" initial={{}} />,
}

export const Summary: Story = {
  name: 'GrantSummary',
  render: () => (
    <div className="flex flex-col gap-4">
      <GrantSummary level="project" value={presetPermissions('project', 'deploy-run')} />
      <GrantSummary level="workspace" value={{}} />
    </div>
  ),
}
