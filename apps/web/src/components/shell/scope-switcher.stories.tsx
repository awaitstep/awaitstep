import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, screen } from 'storybook/test'
import { PanelScopeButton } from './context-panel'
import { RailOrgButton } from './rail-item'
import { ScopeSwitcher } from './scope-switcher'
import {
  MANY_PROJECT_GROUPS,
  ORG_ACTIONS,
  ORG_GROUPS,
  PROJECT_ACTIONS,
  PROJECT_GROUPS,
  WORKSPACE_ACTIONS,
  WORKSPACE_GROUPS,
} from './__tests__/fixtures/switchers'

const meta = {
  title: 'Shell/ScopeSwitcher',
  component: ScopeSwitcher,
  decorators: [
    (Story) => (
      <div className="w-[232px] bg-sidebar">
        <Story />
      </div>
    ),
  ],
  args: { onSelect: fn(), onAction: fn(), defaultOpen: true },
} satisfies Meta<typeof ScopeSwitcher>

export default meta

type Story = StoryObj<typeof meta>

const PROJECT_TRIGGER = (
  <PanelScopeButton
    scope="Project"
    name="Project 101"
    tile={{ initial: 'P' }}
    variant="header"
    className="h-16"
  />
)

export const Project: Story = {
  args: {
    trigger: PROJECT_TRIGGER,
    label: 'Switch project',
    searchPlaceholder: 'Find a project',
    groups: PROJECT_GROUPS,
    currentId: 'project-101',
    currentLabel: 'Current project',
    actions: PROJECT_ACTIONS,
  },
}

export const Workspace: Story = {
  args: {
    trigger: (
      <PanelScopeButton
        scope="Workspace"
        name="Sales"
        tile={{ initial: 'S', colour: 'green' }}
        variant="card"
      />
    ),
    label: 'Switch workspace',
    searchPlaceholder: 'Find a workspace',
    groups: WORKSPACE_GROUPS,
    currentId: 'sales',
    currentLabel: 'Current workspace',
    actions: WORKSPACE_ACTIONS,
  },
}

export const Org: Story = {
  args: {
    trigger: <RailOrgButton name="Acme Inc" initial="A" />,
    label: 'Switch organization',
    side: 'right',
    groups: ORG_GROUPS,
    currentId: 'acme',
    currentLabel: 'Current organization',
    actions: ORG_ACTIONS,
  },
}

export const NoMatches: Story = {
  args: {
    ...Project.args,
    emptyText: (query) => `No projects match “${query}”`,
  },
  // The popover is portalled to <body>, outside the story's canvas.
  play: async ({ userEvent }) => {
    await userEvent.type(await screen.findByRole('combobox'), 'zebra')
  },
}

export const ManyItems: Story = {
  args: {
    ...Project.args,
    groups: MANY_PROJECT_GROUPS,
    currentId: 'project-1',
  },
}
