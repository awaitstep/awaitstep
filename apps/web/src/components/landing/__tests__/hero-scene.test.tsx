import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type * as Scenes from '@awaitstep/landing-scenes'

const support = vi.hoisted(() => ({ ok: true }))
const destroy = vi.hoisted(() => vi.fn())
const mountHeroScene = vi.hoisted(() => vi.fn(async () => ({ destroy })))

vi.mock('@awaitstep/landing-scenes', async (real) => ({
  ...(await real<typeof Scenes>()),
  sceneSupport: () => support,
}))
vi.mock('@awaitstep/landing-scenes/scenes', () => ({ mountHeroScene }))

import { HeroScene } from '../hero-scene'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  support.ok = true
})

describe('HeroScene', () => {
  it('shows the workflow poster before anything loads', () => {
    const { container } = render(<HeroScene />)
    const poster = container.querySelector('svg.scene-poster')
    expect(poster?.getAttribute('aria-label')).toMatch(/refund-review workflow/)
    expect(container.textContent).toMatch(/refund review that waits for approval/)
  })

  it('mounts the 3D scene where the browser can run it, and tears it down on unmount', async () => {
    const { container, unmount } = render(<HeroScene />)
    await waitFor(() =>
      expect(mountHeroScene).toHaveBeenCalledWith(container.querySelector('[data-scene="hero"]')),
    )
    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('draws one poster for wide stages and one centred for narrow ones', () => {
    const { container } = render(<HeroScene />)
    const wide = container.querySelector('svg.scene-poster--wide')
    const narrow = container.querySelector('svg.scene-poster--narrow')
    expect(wide).not.toBeNull()
    expect(narrow).not.toBeNull()
    expect(wide?.getAttribute('viewBox')).not.toBe(narrow?.getAttribute('viewBox'))
  })

  it('keeps the poster, without an unhandled rejection, when the scene fails to mount', async () => {
    mountHeroScene.mockRejectedValueOnce(new Error('Error creating WebGL context'))
    const { container } = render(<HeroScene />)
    await waitFor(() => expect(mountHeroScene).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('svg.scene-poster')).not.toBeNull()
    expect(destroy).not.toHaveBeenCalled()
  })

  it('keeps the poster and loads no scene when the browser should not run one', async () => {
    support.ok = false
    render(<HeroScene />)
    await new Promise((r) => setTimeout(r, 20))
    expect(mountHeroScene).not.toHaveBeenCalled()
  })
})
