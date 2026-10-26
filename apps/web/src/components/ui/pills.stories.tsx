import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './badge'
import { StatusPill, type PillStatus } from './status-pill'
import { ScopeChip, WorkspaceDot } from './workspace-dot'
import { WORKSPACE_COLOURS } from './workspace-colour'

// The pill family in one place: Badge (existing variants unchanged), the
// status pill built on it, and the workspace colour square and chip.
const meta = {
  title: 'UI/Pills',
  component: Badge,
} satisfies Meta<typeof Badge>

export default meta

type Story = StoryObj<typeof meta>

const BADGE_VARIANTS = [
  'default',
  'neutral',
  'outline',
  'success',
  'error',
  'warning',
  'info',
] as const

export const Badges: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {BADGE_VARIANTS.map((variant) => (
          <Badge key={variant} variant={variant} dot>
            {variant}
          </Badge>
        ))}
      </div>
    </div>
  ),
}

const STATUSES: PillStatus[] = ['deployed', 'draft', 'failed', 'running', 'succeeded', 'shared']

export const Statuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {STATUSES.map((status) => (
        <StatusPill key={status} status={status} />
      ))}
      <StatusPill status="deployed">Deployed · v12</StatusPill>
    </div>
  ),
}

export const Kinds: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Workflow</Badge>
      <Badge>Function</Badge>
      <Badge variant="neutral">8 workflows</Badge>
    </div>
  ),
}

export const WorkspaceColours: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {WORKSPACE_COLOURS.map((colour) => (
          <WorkspaceDot key={colour} colour={colour} size="lg" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <ScopeChip colour="green">Sales</ScopeChip>
        <ScopeChip colour="blue">IT</ScopeChip>
        <ScopeChip colour="amber">Project 101 · Support</ScopeChip>
        <ScopeChip colour="blue">from IT · v7</ScopeChip>
      </div>
    </div>
  ),
}
