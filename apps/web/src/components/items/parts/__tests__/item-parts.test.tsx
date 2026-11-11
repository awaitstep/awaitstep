import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListCard } from '../../../ui/list-card'
import { FunctionRow } from '../function-row'
import { ItemLinkRow } from '../item-link-row'
import { SharedItemCard } from '../shared-item-card'
import { WorkflowRow } from '../workflow-row'
import {
  CRM_SYNC,
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
      screen.getByRole('switch', { name: 'Shared with Project 101: Quote follow-up' }),
    )
    expect(onShareChange).toHaveBeenCalledWith(true)
  })

  it('keeps a blocked switch still and says why', async () => {
    const { onShareChange } = renderRow(LEAD_ENRICHMENT)
    const toggle = screen.getByRole('switch', { name: 'Shared with Project 101: Lead enrichment' })
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

describe('FunctionRow', () => {
  function renderFunction(item = CRM_SYNC) {
    render(
      <ListCard label="Functions">
        <FunctionRow
          item={item}
          href="/functions/crm"
          projectName="Project 101"
          onShareChange={vi.fn()}
        />
      </ListCard>,
    )
  }

  it('links the name and shows the description, status, run history and share switch', () => {
    renderFunction()
    expect(screen.getByRole('link', { name: 'CRM sync' })).toHaveAttribute('href', '/functions/crm')
    expect(screen.getByText('Updates leads from the CRM')).toBeVisible()
    expect(screen.getByText('Deployed · v3')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Last 10 runs: 7 succeeded, 3 failed' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Failed 5m ago')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Shared with Project 101: CRM sync' }),
    ).not.toBeChecked()
  })

  it('reads a function that has never run as "Never run"', () => {
    renderFunction({ ...CRM_SYNC, recentRuns: [], lastRun: null })
    expect(screen.getByText('Never run')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'No runs yet' })).toBeInTheDocument()
  })

  it('keeps the switch still when a denial carries no reason', () => {
    renderFunction({ ...CRM_SYNC, shareToggle: { allowed: false } })
    expect(
      screen.getByRole('switch', { name: 'Shared with Project 101: CRM sync' }),
    ).toHaveAccessibleDescription('Sharing isn’t available yet')
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

  it('reads a function’s last run the same way', () => {
    render(
      <ul>
        <ItemLinkRow item={CRM_SYNC} href="/functions/crm" />
      </ul>,
    )
    const link = screen.getByRole('link')
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

  it('names the item without a link when the viewer can’t open its workspace', () => {
    render(<SharedItemCard item={{ ...PROVISION_ACCOUNT, canOpen: false }} href={null} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Provision account')).toBeVisible()
    expect(screen.getByText(/from IT · v7/)).toBeVisible()
  })
})
