import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrgSettingsIntro } from '../org-settings-intro'

const ORG = { slug: 'acme', name: 'Acme Inc' }

describe('OrgSettingsIntro', () => {
  it('titles the page Settings and lists its sections as tabs, General first', () => {
    render(<OrgSettingsIntro org={ORG} section="members" />)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Your organization’s details and members.')).toBeInTheDocument()
    const tabs = within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole(
      'link',
    )
    expect(tabs.map((t) => [t.textContent, t.getAttribute('href')])).toEqual([
      ['General', '/acme/settings/general'],
      ['Members', '/acme/settings/members'],
    ])
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page')
  })

  it('has no Connections or API keys tab: those are rail items now', () => {
    render(<OrgSettingsIntro org={ORG} section="general" />)
    expect(screen.queryByRole('link', { name: /Connections|API/ })).toBeNull()
  })
})
