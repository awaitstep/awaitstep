import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ListCard } from '../../ui/list-card'
import type { InboxNotification } from '../../../types/dashboard/inbox'
import { NotificationRow } from './notification-row'
import { APPROVED, DECLINED, FAILURE, JOINED, REQUEST } from './__tests__/fixtures/inbox'

// Rows from the Notifications board.
const meta = {
  title: 'Inbox/NotificationRow',
  decorators: [
    (Story) => (
      <div className="max-w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function InboxDemo() {
  const [items, setItems] = useState<InboxNotification[]>([FAILURE, REQUEST, JOINED])

  function update(id: string, change: Partial<InboxNotification>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  function handleRead(id: string) {
    update(id, { read: true })
  }

  function handleApprove(id: string) {
    update(id, { read: true, needsAction: false, request: APPROVED.request })
  }

  function handleDecline(id: string) {
    update(id, { read: true, needsAction: false, request: DECLINED.request })
  }

  return (
    <ListCard label="Notifications">
      {items.map((item) => (
        <NotificationRow
          key={item.id}
          notification={item}
          onRead={handleRead}
          onApprove={handleApprove}
          onDecline={handleDecline}
        />
      ))}
    </ListCard>
  )
}

export const Inbox: Story = {
  render: () => <InboxDemo />,
}

export const States: Story = {
  render: () => (
    <ListCard label="Notifications">
      <NotificationRow notification={FAILURE} />
      <NotificationRow notification={REQUEST} />
      <NotificationRow notification={APPROVED} />
      <NotificationRow notification={DECLINED} />
      <NotificationRow notification={JOINED} />
    </ListCard>
  ),
}
