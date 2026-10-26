import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { AccessDraft } from '../../../types/dashboard/access'
import { AccessTree } from './access-tree'
import { ACCESS_PROJECTS, DANIEL_ACCESS } from './__tests__/fixtures/projects'

// The Edit access panel's body, from AccessEditor.
const meta = {
  title: 'Access/AccessTree',
  decorators: [
    (Story) => (
      <div className="max-w-[512px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function TreeDemo({ initial }: { initial: AccessDraft }) {
  const [value, setValue] = useState(initial)
  return (
    <AccessTree
      personFirstName="Daniel"
      orgName="Acme Inc"
      projects={ACCESS_PROJECTS}
      value={value}
      onChange={setValue}
    />
  )
}

export const MemberWithWorkspaceRole: Story = {
  render: () => <TreeDemo initial={DANIEL_ACCESS} />,
}

export const ProjectRoleCoversWorkspaces: Story = {
  render: () => (
    <TreeDemo
      initial={{
        ...DANIEL_ACCESS,
        projects: { p101: 'member' },
        workspaces: { 'i-default': 'viewer' },
      }}
    />
  ),
}

export const NothingYet: Story = {
  render: () => <TreeDemo initial={{ orgRole: 'member', projects: {}, workspaces: {} }} />,
}

export const Admin: Story = {
  render: () => <TreeDemo initial={{ ...DANIEL_ACCESS, orgRole: 'admin' }} />,
}

export const Owner: Story = {
  render: () => <TreeDemo initial={{ ...DANIEL_ACCESS, orgRole: 'owner' }} />,
}
