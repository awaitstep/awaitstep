import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListCard } from '../../../ui/list-card'
import { ItemLinkRow } from '../item-link-row'
import { SharedItemCard } from '../shared-item-card'
import { TrafficBars } from '../traffic-bars'
import { WorkflowRow } from '../workflow-row'
import {
  LEAD_ENRICHMENT,
  PROVISION_ACCOUNT,
  QUOTE_FOLLOW_UP,
  WEEKLY_REPORT,
} from './fixtures/items'

function renderRow(item = QUOTE_FOLLOW_UP, onShareChange = vi.fn()) {
  render(
    <ListCard label="Workflows">
      <WorkflowRow
        item={item}
        href="/workflows/x"
        projectName="Project 101"
        onShareChange={onShareChange}
      />
    </ListCard>,
  )
  return { onShareChange }
}

describe('WorkflowRow', () => {
  it('links the name and shows status, history and the last run', () => {
    renderRow(LEAD_ENRICHMENT)
    expect(screen.getByRole('link', { name: 'Lead enrichment' })).toHaveAttribute(
      'href',
      '/workflows/x',
    )
    expect(screen.getByText('Deployed · v12')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Last 10 runs: 7 succeeded, 3 failed' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Failed 5m ago')).toHaveClass('text-status-error')
  })

  it('flips the share switch', async () => {
    const { onShareChange } = renderRow()
    await userEvent.click(
      screen.getByRole('switch', { name: 'Share Quote follow-up with Project 101' }),
    )
    expect(onShareChange).toHaveBeenCalledWith(true)
  })

  it('keeps a blocked switch still and says why', async () => {
    const { onShareChange } = renderRow(LEAD_ENRICHMENT)
    const toggle = screen.getByRole('switch', { name: 'Share Lead enrichment with Project 101' })
    expect(toggle).toHaveAccessibleDescription(/Called by IT/)
    await userEvent.click(toggle)
    expect(onShareChange).not.toHaveBeenCalled()
  })

  it('reads a draft as "Draft" and "Never run"', () => {
    renderRow(WEEKLY_REPORT)
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Never run')).toBeInTheDocument()
  })
})

describe('ItemLinkRow', () => {
  it('makes the whole phone row one link', () => {
    render(
      <ul>
        <ItemLinkRow item={LEAD_ENRICHMENT} href="/workflows/lead" />
      </ul>,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/workflows/lead')
    expect(within(link).getByText('Deployed · v12')).toBeInTheDocument()
    expect(within(link).getByText('Failed 5m ago')).toBeInTheDocument()
  })
})

describe('SharedItemCard', () => {
  it('names the item, its kind and where it comes from', () => {
    render(<SharedItemCard item={PROVISION_ACCOUNT} href="/workflows/provision" />)
    const link = screen.getByRole('link')
    expect(link).toHaveTextContent('Provision account')
    expect(link).toHaveTextContent('Workflow')
    expect(link).toHaveTextContent('from IT · v7')
  })
})

describe('TrafficBars', () => {
  it('is one labelled image with a bar per bucket, scaled to the busiest', () => {
    render(<TrafficBars buckets={[0, 5, 10]} />)
    const img = screen.getByRole('img', { name: 'Requests over the last 24 hours: 15' })
    const bars = img.querySelectorAll('span')
    expect(bars).toHaveLength(3)
    expect((bars[0] as HTMLElement).style.height).toBe('2px')
    expect((bars[2] as HTMLElement).style.height).toBe('22px')
  })
})
