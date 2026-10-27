import type { Meta, StoryObj } from '@storybook/react-vite'
import { ListCard } from '../../ui/list-card'
import { ItemLinkRow } from './item-link-row'
import { SharedItemCard } from './shared-item-card'
import { TrafficBars } from './traffic-bars'
import { WorkflowRow } from './workflow-row'
import {
  CRM_SYNC,
  LEAD_ENRICHMENT,
  PROVISION_ACCOUNT,
  QUOTE_FOLLOW_UP,
  SEND_SLACK_ALERT,
  WEEKLY_REPORT,
} from './__tests__/fixtures/items'

// The workspace list parts, from Workflows, ViewerWorkflows, WsFunctions and MobileWorkflows.
const meta = {
  title: 'Items/Parts',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const noop = () => {}
const VIEWER = { allowed: false, reason: 'Only Editors can share' }

export const WorkflowRows: Story = {
  render: () => (
    <div className="max-w-screen-xl">
      <ListCard label="Workflows in Sales">
        {[LEAD_ENRICHMENT, QUOTE_FOLLOW_UP, WEEKLY_REPORT].map((item) => (
          <WorkflowRow
            key={item.id}
            item={item}
            href="#"
            projectName="Project 101"
            onShareChange={noop}
          />
        ))}
      </ListCard>
    </div>
  ),
}

export const ViewerRows: Story = {
  render: () => (
    <div className="max-w-screen-xl">
      <ListCard label="Workflows in Sales">
        {[LEAD_ENRICHMENT, QUOTE_FOLLOW_UP].map((item) => (
          <WorkflowRow
            key={item.id}
            item={{ ...item, shareToggle: VIEWER }}
            href="#"
            projectName="Project 101"
            onShareChange={noop}
          />
        ))}
      </ListCard>
    </div>
  ),
}

export const PhoneRows: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  render: () => (
    <div className="max-w-[390px]">
      <ListCard label="Workflows in Sales">
        {[LEAD_ENRICHMENT, QUOTE_FOLLOW_UP, WEEKLY_REPORT].map((item) => (
          <ItemLinkRow key={item.id} item={item} href="#" />
        ))}
      </ListCard>
    </div>
  ),
}

export const SharedCards: Story = {
  render: () => (
    <ul className="grid max-w-screen-lg grid-cols-1 gap-3.5 md:grid-cols-2">
      {[PROVISION_ACCOUNT, SEND_SLACK_ALERT].map((item) => (
        <li key={item.id} className="flex [&>a]:flex-1">
          <SharedItemCard item={item} href="#" />
        </li>
      ))}
    </ul>
  ),
}

export const Traffic: Story = {
  render: () => <TrafficBars buckets={CRM_SYNC.traffic!.buckets} />,
}
