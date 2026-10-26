import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../badge'
import { StatusPill } from '../status-pill'
import { StatTile, Tile } from '../tile'
import { ScopeChip } from '../workspace-dot'

describe('Badge', () => {
  it('keeps the existing variants as they were', () => {
    render(<Badge variant="success">Live</Badge>)
    expect(screen.getByText('Live')).toHaveClass(
      'rounded-full',
      'bg-status-success/10',
      'text-status-success',
    )
  })

  it('adds a decorative dot only when asked', () => {
    const { container } = render(
      <>
        <Badge>Plain</Badge>
        <Badge dot>Dotted</Badge>
      </>,
    )
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(screen.getByText('Dotted')).toHaveTextContent(/^Dotted$/)
  })
})

describe('StatusPill', () => {
  it('says the status in words, so colour is never the only signal', () => {
    render(<StatusPill status="failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('takes a more specific label', () => {
    render(<StatusPill status="deployed">Deployed · v12</StatusPill>)
    expect(screen.getByText('Deployed · v12')).toBeInTheDocument()
  })
})

describe('Tile', () => {
  it('is hidden from assistive tech, since the row beside it carries the meaning', () => {
    render(<Tile tone="fail">L</Tile>)
    expect(screen.getByText('L')).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('StatTile', () => {
  it('is a link named by its value and label when given an href', () => {
    render(<StatTile value={1} label="Failing now" tone="danger" href="/acme/failing" />)
    expect(screen.getByRole('link', { name: '1 Failing now' })).toHaveAttribute(
      'href',
      '/acme/failing',
    )
  })

  it('is plain text without an href', () => {
    render(<StatTile value={3} label="Projects" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })
})

describe('ScopeChip', () => {
  it('reads as the workspace name alone; the colour square is decorative', () => {
    render(<ScopeChip colour="green">Project 101 · Sales</ScopeChip>)
    expect(screen.getByText('Project 101 · Sales')).toHaveTextContent(/^Project 101 · Sales$/)
  })
})
