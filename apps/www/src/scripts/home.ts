import { isPlainClick } from './clicks'

/**
 * The hero video: a recorded pass through the dashboard. It plays and loops unless the visitor
 * prefers reduced motion or has asked to save data, and pauses while off screen. Otherwise, and
 * without script, the poster stands still.
 */
function initHeroVideo() {
  const video = document.querySelector<HTMLVideoElement>('[data-hero-video]')
  if (!video || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) void video.play().catch(() => undefined)
    else video.pause()
  }).observe(video)
}

/**
 * The How it works section: while it is pinned, scroll position picks the step. Each step gets
 * an equal share of the scroll; the active beat's bar fills through its share and its screen shows.
 */
function initSteps() {
  const section = document.querySelector<HTMLElement>('[data-steps]')
  const track = section?.querySelector<HTMLElement>('.loop__track')
  const pin = section?.querySelector<HTMLElement>('.loop__pin')
  if (!section || !track || !pin) return
  const beats = [...section.querySelectorAll<HTMLElement>('.loop__beats li')]
  const shots = [...section.querySelectorAll<HTMLElement>('.loop__shot')]
  // On a phone the steps show titles only; the active step's line shows under them.
  const now = section.querySelector<HTMLElement>('.loop__now')
  if (beats.length === 0 || beats.length !== shots.length) return
  section.classList.add('is-pinned')

  let active = -1
  let queued = false
  const update = () => {
    queued = false
    const travel = track.offsetHeight - pin.offsetHeight
    const progress =
      travel > 0 ? Math.min(0.9999, Math.max(0, -track.getBoundingClientRect().top / travel)) : 0
    const at = progress * beats.length
    const index = Math.floor(at)
    beats.forEach((b, i) =>
      b.style.setProperty('--p', String(i < index ? 1 : i === index ? at - index : 0)),
    )
    if (index === active) return
    active = index
    beats.forEach((b, i) =>
      i === index ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current'),
    )
    shots.forEach((s, i) => s.classList.toggle('is-active', i === index))
    if (now) now.textContent = beats[index].querySelector('p')?.textContent ?? ''
  }
  const onScroll = () => {
    if (!queued) {
      queued = true
      requestAnimationFrame(update)
    }
  }
  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll)
  update()
}

/**
 * The demo overlay: the hero's "Watch the demo" link opens the one-minute demo in a modal and
 * plays it from the start with sound. Closing it (the button, Escape, or a click outside the
 * video) pauses it. Without script the link opens the video file itself.
 */
function initDemo() {
  const open = document.querySelector<HTMLAnchorElement>('[data-demo-open]')
  const dialog = document.querySelector<HTMLDialogElement>('[data-demo]')
  const video = dialog?.querySelector('video')
  if (!open || !dialog || !video) return
  open.addEventListener('click', (event) => {
    // Cmd, Ctrl, Shift or a middle click opens the video in a new tab, as with any link.
    if (!isPlainClick(event)) return
    event.preventDefault()
    dialog.showModal()
    video.currentTime = 0
    void video.play().catch(() => undefined)
  })
  dialog.querySelector('[data-demo-close]')?.addEventListener('click', () => dialog.close())
  // Only a click on the backdrop lands on the dialog element itself; its padding is on .demo__body.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => video.pause())
}

export function initPage() {
  initSteps()
  initHeroVideo()
  initDemo()
}
