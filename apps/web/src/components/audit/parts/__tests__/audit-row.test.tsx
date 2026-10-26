import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ListCard } from '../../../ui/list-card'
import { AuditRow } from '../audit-row'
import { AUDIT_EVENTS } from './fixtures/events'

function renderEvent(id: string) {
  const event = AUDIT_EVENTS.find((candidate) => candidate.id === id)!
  render(
    <ListCard label="Events">
      <AuditRow event={event} />
    </ListCard>,
  )
  return screen.getByRole('listitem')
}

describe('AuditRow', () => {
  it('reads as one sentence with the actor and target in bold', () => {
    const row = renderEvent('blocked-delete')
    expect(row).toHaveTextContent('Tom Becker tried to delete the workspace IT')
    const bold = row.querySelectorAll('strong')
    expect([...bold].map((node) => node.textContent)).toEqual(['Tom Becker', 'IT'])
    expect(within(row).getByText('Blocked by the deletion lock · 81.2.69.x')).toBeVisible()
  })

  it('names the scope it happened in', () => {
    const row = renderEvent('deploy')
    expect(within(row).getByText('Project 101 · Sales')).toBeVisible()
  })

  it('shows a recent event’s time relative to now', () => {
    expect(within(renderEvent('deploy')).getByText('22 minutes ago')).toHaveAttribute('dateTime')
  })

  it('dates an event older than a week', () => {
    const row = renderEvent('lock')
    expect(within(row).getByText('12 Oct')).toHaveAttribute('dateTime', '2026-10-12T09:30:00.000Z')
  })
})
