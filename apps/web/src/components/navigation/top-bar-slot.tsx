import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Pages put their search field and main action in the frame's top bar, as the
// boards draw them, without the frame knowing about each page: the frame marks
// the spot, the page renders into it from its own tree (so its state stays
// local), through a portal.

const SlotTarget = createContext<HTMLElement | null>(null)
const SetSlotTarget = createContext<(node: HTMLElement | null) => void>(() => {})

export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  return (
    <SetSlotTarget.Provider value={setTarget}>
      <SlotTarget.Provider value={target}>{children}</SlotTarget.Provider>
    </SetSlotTarget.Provider>
  )
}

/** Where page content lands in the top bar. The frame renders it once. */
export function TopBarSlotTarget() {
  const setTarget = useContext(SetSlotTarget)
  return <div ref={setTarget} className="flex min-w-0 flex-1 items-center justify-end gap-3" />
}

/** Renders its children in the frame's top bar (desktop only; the top bar hides below `md`). */
export function TopBarContent({ children }: { children: ReactNode }) {
  const target = useContext(SlotTarget)
  return target ? createPortal(children, target) : null
}
