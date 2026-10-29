import type { Meta, StoryObj } from '@storybook/react-vite'
import type { WorkspaceVariable } from '../../../types/dashboard/variables'
import { WorkspaceVariableTable } from './workspace-variable-table'

// Access › Variables: resolved for one workspace.
const meta = {
  title: 'Variables/WorkspaceVariableTable',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const VARIABLES: WorkspaceVariable[] = [
  {
    id: 'v_crm_base_url',
    name: 'CRM_BASE_URL',
    value: 'https://crm.acme.test',
    isSecret: false,
    source: { level: 'workspace', name: 'Sales' },
    overrides: 'project',
  },
  {
    id: 'v_slack_token',
    name: 'SLACK_TOKEN',
    value: null,
    isSecret: true,
    source: { level: 'project', name: 'Project 101' },
    overrides: null,
  },
  {
    id: 'v_region',
    name: 'REGION',
    value: 'eu',
    isSecret: false,
    source: { level: 'organization', name: 'Acme Inc' },
    overrides: null,
  },
]

export const ResolvedForSales: Story = {
  render: () => (
    <WorkspaceVariableTable caption="Variables in Sales" variables={VARIABLES} colour="green" />
  ),
}
