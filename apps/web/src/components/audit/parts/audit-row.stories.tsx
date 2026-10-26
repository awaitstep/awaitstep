import type { Meta, StoryObj } from '@storybook/react-vite'
import { ListCard } from '../../ui/list-card'
import { AuditRow } from './audit-row'
import { AUDIT_EVENTS } from './__tests__/fixtures/events'

// Event rows from the AuditLog board, one of each kind.
const meta = {
  title: 'Audit/AuditRow',
  decorators: [
    (Story) => (
      <div className="max-w-[1100px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const EachKind: Story = {
  render: () => (
    <ListCard label="Audit events">
      {AUDIT_EVENTS.map((event) => (
        <AuditRow key={event.id} event={event} />
      ))}
    </ListCard>
  ),
}
