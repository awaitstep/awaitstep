import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BookOpen, Workflow } from 'lucide-react'
import { PanelItem, PanelSection } from '../panel-item'

describe('PanelItem', () => {
  it('sets aria-current only when active', () => {
    render(
      <PanelSection>
        <PanelItem href="/a" icon={Workflow} label="Active" active />
        <PanelItem href="/b" icon={Workflow} label="Inactive" />
      </PanelSection>,
    )
    expect(screen.getByRole('link', { name: 'Active' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inactive' })).not.toHaveAttribute('aria-current')
  })

  it('renders a badge of 0 inside the trailing slot, not as a bare text node', () => {
    render(<PanelItem href="/runs" icon={Workflow} label="Runs" badge={0} />)
    expect(screen.getByText('0').tagName).toBe('SPAN')
  })

  it('never marks an external item as the current page, even when asked to', () => {
    render(
      <PanelItem href="https://docs.awaitstep.dev" icon={BookOpen} label="Docs" external active />,
    )
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).not.toHaveAttribute('aria-current')
    expect(link.querySelector('[data-active-bar]')).toBeNull()
  })
})
