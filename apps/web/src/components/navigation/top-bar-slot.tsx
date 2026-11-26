import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePhoneLayout } from '../../hooks/use-phone-layout'
import { cn } from '../../lib/utils'
import { slotTargetFor, type SlotTargets } from './top-bar-slot-target'

// Pages put their search field and main action in the frame's top bar, as the
// boards draw them, without the frame knowing about each page: the frame marks
// the spot, the page renders into it from its own tree (so its state stays
// local), through a portal. The top bar hides on a phone, so the frame marks
// a second spot there, under the phone header, and the content moves to it.

interface SlotSetters {
  topBar: (node: HTMLElement | null) => void
  phone: (node: HTMLElement | null) => void
}

const NO_TARGETS: SlotTargets = { topBar: null, phone: null }
const Targets = createContext<SlotTargets>(NO_TARGETS)
const Setters = createContext<SlotSetters>({ topBar: () => {}, phone: () => {} })

export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [topBar, setTopBar] = useState<HTMLElement | null>(null)
  const [phone, setPhone] = useState<HTMLElement | null>(null)
  const targets = useMemo(() => ({ topBar, phone }), [topBar, phone])
  const setters = useMemo(() => ({ topBar: setTopBar, phone: setPhone }), [])
  return (
    <Setters.Provider value={setters}>
      <Targets.Provider value={targets}>{children}</Targets.Provider>
    </Setters.Provider>
  )
}

/** Where page content lands in the top bar. The frame renders it once. */
export function TopBarSlotTarget() {
  const { topBar } = useContext(Setters)
  return <div ref={topBar} className="flex min-w-0 flex-1 items-center justify-end gap-3" />
}

// Buttons in the strip are compact, so a search field and an action share one
// short line above the page.
const PHONE_STRIP = cn(
  'sticky top-14 z-20 flex items-center justify-end gap-2 border-b border-border bg-background px-6 py-2.5 empty:hidden md:hidden',
  '[&_:is(button,a)]:h-7 [&_:is(button,a)]:gap-1.5 [&_:is(button,a)]:px-2.5 [&_:is(button,a)]:text-2xs [&_:is(button,a)_svg]:size-3.5',
)

/**
 * Below `md`, where the same content lands instead: a strip under the phone
 * header that stays in view as the page scrolls, and folds away when empty.
 */
export function PhoneActionsSlotTarget() {
  const { phone } = useContext(Setters)
  return <div ref={phone} className={PHONE_STRIP} />
}

/** Renders its children in the frame's top bar, or under the phone header on a phone. */
export function TopBarContent({ children }: { children: ReactNode }) {
  const targets = useContext(Targets)
  const target = slotTargetFor(targets, usePhoneLayout())
  return target ? createPortal(children, target) : null
}
