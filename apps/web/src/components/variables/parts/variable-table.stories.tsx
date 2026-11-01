import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ResolvedVariable } from '../../../types/dashboard/variables'
import { VariableTable } from './variable-table'

// ProjectVariables: the resolved list.
const meta = {
  title: 'Variables/VariableTable',
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const SALES = { id: 'ws_sales', slug: 'sales', name: 'Sales', colour: 'green' as const }

const VARIABLES: ResolvedVariable[] = [
  {
    id: 'v_slack_token',
    name: 'SLACK_TOKEN',
    value: null,
    isSecret: true,
    setAt: { level: 'project', name: 'Project 101' },
    overriddenIn: [],
    reach: null,
  },
  {
    id: 'v_crm_base_url',
    name: 'CRM_BASE_URL',
    value: 'https://crm-staging.acme.test',
    isSecret: false,
    setAt: { level: 'project', name: 'Project 101' },
    overriddenIn: [SALES],
    reach: null,
  },
  {
    id: 'v_region',
    name: 'REGION',
    value: 'eu',
    isSecret: false,
    setAt: { level: 'organization', name: 'Acme Inc' },
    overriddenIn: [],
    reach: null,
  },
]

const overrideHref = () => '#workspace-settings'
const actionHref = (v: ResolvedVariable) => `#${v.name}`

export const Editable: Story = {
  render: () => (
    <VariableTable
      caption="Variables"
      variables={VARIABLES}
      overrideHref={overrideHref}
      actionHref={actionHref}
    />
  ),
}

export const ReadOnly: Story = {
  render: () => (
    <VariableTable caption="Variables" variables={VARIABLES} overrideHref={overrideHref} />
  ),
}
