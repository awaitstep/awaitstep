import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NoAccessPanel } from '../no-access-panel'
import { GIVERS } from './fixtures/givers'

function renderPanel(givers = GIVERS) {
  return render(
    <NoAccessPanel
      title="You can’t see the audit log"
      why="It lists sign-ins, API keys and access changes for everyone in Acme Inc, so it’s kept to owners and admins."
      orgName="Acme Inc"
      viewerRole="member"
      givers={givers}
      backHref="/acme/projects"
    />,
  )
}

describe('NoAccessPanel', () => {
  it('names who can give access, as chips under a heading that fits how many', () => {
    renderPanel()
    expect(screen.getByText('Either of these can give you access')).toBeInTheDocument()
    const chips = within(
      screen.getByRole('list', { name: 'Who can give you access' }),
    ).getAllByRole('listitem')
    expect(chips.map((c) => c.textContent)).toEqual(['AMAma MensahOwner', 'LOLena OrtizAdmin'])
  })

  it('says “They” for one person and “Any of these” for more than two', () => {
    const { unmount } = renderPanel(GIVERS.slice(0, 1))
    expect(screen.getByText('They can give you access')).toBeInTheDocument()
    unmount()
    renderPanel([...GIVERS, { ...GIVERS[1]!, person: { ...GIVERS[1]!.person, id: 'u-3' } }])
    expect(screen.getByText('Any of these can give you access')).toBeInTheDocument()
  })

  it('draws the redacted list behind the panel, hidden from screen readers', () => {
    const { container } = renderPanel()
    const hidden = container.querySelectorAll('[aria-hidden="true"]')
    expect(hidden.length).toBeGreaterThan(0)
    // Only the givers are a list to assistive tech: the redacted rows are decoration.
    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'You can’t see the audit log' })).toBeVisible()
  })
})
