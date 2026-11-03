import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiPlaygroundPanel } from '../api-playground-panel'

describe('ApiPlaygroundPanel', () => {
  it('fills the viewport minus the chrome: header + bottom tab bar (7rem) on phones, the top bar (4rem) on md', () => {
    const { container } = render(<ApiPlaygroundPanel />)
    const root = container.firstElementChild as HTMLElement
    // The fixed MobileTabBar (h-14) sits over the bottom below md, so the mobile
    // height must subtract it as well as the header — a regression if it drops to 3.5rem.
    expect(root.className).toContain('h-[calc(100svh-7rem)]')
    expect(root.className).toContain('md:h-[calc(100svh-4rem)]')
  })

  it('names the page for phones, where the top bar breadcrumb is hidden', () => {
    render(<ApiPlaygroundPanel />)
    const heading = screen.getByRole('heading', { name: 'API Playground' })
    expect(heading.className).toContain('md:hidden')
  })
})
