import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Workflow } from 'lucide-react'
import { ActionCard } from '../action-card'
import { EmptyState } from '../empty-state'
import { ProgressMeter } from '../progress-meter'

describe('EmptyState', () => {
  it("keeps today's look when given only today's props", () => {
    const { container } = render(
      <EmptyState
        icon={Workflow}
        title="No workflows yet"
        description="Create one."
        action={<button>New workflow</button>}
      />,
    )
    expect(container.firstChild).toHaveClass(
      'rounded-lg',
      'border',
      'border-dashed',
      'border-border',
      'px-6',
      'py-12',
    )
    expect(screen.getByRole('heading', { level: 3, name: 'No workflows yet' })).toHaveClass(
      'text-sm',
    )
    expect(screen.getByRole('button', { name: 'New workflow' })).toBeInTheDocument()
  })

  it('renders every action and the heading level it is given', () => {
    render(
      <EmptyState
        icon={<span data-testid="art" />}
        size="lg"
        tone="welcome"
        headingLevel={1}
        title="Nothing in Support yet"
        description="Only people with access to Support will see it."
        actions={
          <>
            <button>New workflow</button>
            <button>New function</button>
            <button>Import</button>
          </>
        }
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Nothing in Support yet' })).toBeVisible()
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByTestId('art')).toBeInTheDocument()
  })
})

describe('ActionCard', () => {
  it('is one link named by its title and described by its description', () => {
    render(
      <ActionCard
        href="/acme/new-project"
        icon={Workflow}
        tone="ok"
        title="Create a project"
        description="Where your workflows will live"
        corner="Step 1"
        cta="Start"
        highlighted
      />,
    )
    const link = screen.getByRole('link', { name: 'Create a project' })
    expect(link).toHaveAttribute('href', '/acme/new-project')
    expect(link).toHaveAccessibleDescription('Where your workflows will live')
    expect(link).toHaveClass('border-primary')
  })
})

describe('ProgressMeter', () => {
  it('is a progress bar that reads its count in words', () => {
    render(<ProgressMeter done={1} total={3} label="Set up Billing" />)
    const bar = screen.getByRole('progressbar', { name: 'Set up Billing' })
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
    expect(bar).toHaveAttribute('aria-valuetext', '1 of 3 done')
  })
})
