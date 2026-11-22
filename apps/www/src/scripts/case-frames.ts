/**
 * The use cases page's drawing frames. A drawing wider than its frame (on a phone) opens centred
 * on its main path and is a tab stop, so a keyboard can scroll it; one that fits is not a tab stop.
 * Without script every frame stays focusable, since it may be scrolling.
 */
export function syncCaseFrame(frame: HTMLElement) {
  const scrolls = frame.scrollWidth > frame.clientWidth
  if (scrolls) frame.setAttribute('tabindex', '0')
  else frame.removeAttribute('tabindex')
}

export function initCaseFrames(root: ParentNode = document) {
  const frames = [...root.querySelectorAll<HTMLElement>('.case__scroll')]
  for (const frame of frames) {
    syncCaseFrame(frame)
    frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) syncCaseFrame(entry.target as HTMLElement)
  })
  for (const frame of frames) observer.observe(frame)
}
