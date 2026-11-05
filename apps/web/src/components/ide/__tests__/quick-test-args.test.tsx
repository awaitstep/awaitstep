import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuickTestArgs } from '../quick-test-args'

describe('QuickTestArgs tab semantics', () => {
  it('ties each tab to the panel and the panel to the selected tab', () => {
    render(
      <QuickTestArgs
        active="env"
        texts={{ inputs: '{}', env: '{}', event: '{}' }}
        invalid={null}
        noInputs={false}
        onSelect={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    const panel = screen.getByRole('tabpanel')
    const tabs = screen.getAllByRole('tab')
    for (const tab of tabs) {
      expect(tab.id).not.toBe('')
      expect(tab).toHaveAttribute('aria-controls', panel.id)
    }
    expect(panel).toHaveAccessibleName('env')
    expect(panel.getAttribute('aria-labelledby')).toBe(screen.getByRole('tab', { name: 'env' }).id)
  })
})
