/**
 * The nav every page shares. Over a full-bleed hero it starts see-through and turns solid once
 * the hero scrolls away. On narrow screens its links fold into a menu button: Escape or a click
 * on a link closes the menu and focus returns to the button. Without script the links stay listed.
 */
function initNavSurface(nav: HTMLElement) {
  const hero = document.querySelector<HTMLElement>('.hero, .page-head')
  if (!nav.hasAttribute('data-over-hero') || !hero) return
  new IntersectionObserver(([entry]) => nav.classList.toggle('is-solid', !entry.isIntersecting), {
    rootMargin: `-${nav.offsetHeight}px 0px 0px 0px`,
  }).observe(hero)
}

function initNavMenu(nav: HTMLElement) {
  const toggle = nav.querySelector<HTMLButtonElement>('[data-nav-toggle]')
  const menu = nav.querySelector<HTMLElement>('[data-nav-menu]')
  if (!toggle || !menu) return
  toggle.hidden = false

  const setOpen = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open))
    nav.classList.toggle('is-open', open)
  }
  const close = () => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return
    setOpen(false)
    toggle.focus()
  }

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'))
  menu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) setOpen(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })
  // A tap anywhere outside the nav closes the menu, as it would close any popover.
  document.addEventListener('click', (event) => {
    if (nav.classList.contains('is-open') && !nav.contains(event.target as Node)) setOpen(false)
  })
  // Growing past the menu breakpoint closes it, so a wide screen never keeps the open panel.
  matchMedia('(min-width: 64.0625rem)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false)
  })
}

/** Wires the nav, and marks the page ready so the head script's no-script fallback stands down. */
export function initSite() {
  document.documentElement.setAttribute('data-site-ready', '')
  const nav = document.querySelector<HTMLElement>('[data-nav]')
  if (!nav) return
  initNavSurface(nav)
  initNavMenu(nav)
}
