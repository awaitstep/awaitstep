// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import navSource from '../../components/site/SiteNav.astro?raw'
import { initSite } from '../site'

const NAV = `
  <header class="nav" data-nav>
    <a class="wordmark" href="/">AwaitStep</a>
    <button class="nav__toggle" aria-expanded="false" aria-controls="site-menu" data-nav-toggle hidden></button>
    <nav id="site-menu" data-nav-menu><a href="/pricing">Pricing</a></nav>
    <a class="signin" href="https://app.awaitstep.dev">Sign in</a>
  </header>
  <main><p id="outside">Body</p></main>
`

let mediaChange: ((event: { matches: boolean }) => void) | undefined

beforeEach(() => {
  document.body.innerHTML = NAV
  document.documentElement.removeAttribute('data-site-ready')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: (_: string, fn: (event: { matches: boolean }) => void) => {
        mediaChange = fn
      },
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const nav = () => document.querySelector<HTMLElement>('[data-nav]')!
const toggle = () => document.querySelector<HTMLButtonElement>('[data-nav-toggle]')!
const isOpen = () => nav().classList.contains('is-open')

describe('initSite', () => {
  it('marks the page ready so the no-script fallback stands down', () => {
    initSite()
    expect(document.documentElement.hasAttribute('data-site-ready')).toBe(true)
  })

  it('shows the menu button and opens and closes the menu with it', () => {
    initSite()
    expect(toggle().hidden).toBe(false)
    toggle().click()
    expect(isOpen()).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    toggle().click()
    expect(isOpen()).toBe(false)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on Escape and returns focus to the button', () => {
    initSite()
    toggle().click()
    document.querySelector<HTMLAnchorElement>('#site-menu a')!.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(isOpen()).toBe(false)
    expect(document.activeElement).toBe(toggle())
  })

  it('closes when a link in it is clicked, or on a click outside the nav', () => {
    initSite()
    toggle().click()
    document
      .querySelector<HTMLAnchorElement>('#site-menu a')!
      .addEventListener('click', (e) => e.preventDefault())
    document.querySelector<HTMLAnchorElement>('#site-menu a')!.click()
    expect(isOpen()).toBe(false)

    toggle().click()
    document.getElementById('outside')!.click()
    expect(isOpen()).toBe(false)
  })

  it('stays open on a click inside the nav that is not a link', () => {
    initSite()
    toggle().click()
    nav().click()
    expect(isOpen()).toBe(true)
  })

  it('closes when the screen grows past the menu breakpoint', () => {
    initSite()
    toggle().click()
    mediaChange?.({ matches: true })
    expect(isOpen()).toBe(false)
  })
})

describe('the nav markup', () => {
  it('puts the menu button before the links it opens, so Tab goes straight into them', () => {
    const source: string = navSource
    expect(source.indexOf('data-nav-toggle')).toBeGreaterThan(0)
    expect(source.indexOf('data-nav-toggle')).toBeLessThan(source.indexOf('data-nav-menu'))
  })
})
