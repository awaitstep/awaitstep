import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  NoProjectPanel,
  OrgSettingsPanel,
  ProjectSettingsPanel,
  WorkspacePanel,
} from './__tests__/fixtures/frame'
import { ContextPanel } from './context-panel'

// The panel's modes are compositions, so each story renders one of them.
const meta = {
  title: 'Shell/ContextPanel',
  component: ContextPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="flex h-[900px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContextPanel>

export default meta

type Story = StoryObj<typeof meta>

const unusedArgs = { label: '', header: null, children: null }

export const Workspace: Story = {
  args: unusedArgs,
  render: () => <WorkspacePanel active="workflows" />,
}

export const ProjectSettings: Story = {
  args: unusedArgs,
  render: () => <ProjectSettingsPanel active="general" />,
}

export const OrgSettings: Story = {
  args: unusedArgs,
  render: () => <OrgSettingsPanel active="members" />,
}

export const NoProject: Story = {
  args: unusedArgs,
  render: () => <NoProjectPanel />,
}
