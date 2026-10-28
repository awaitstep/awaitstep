import type { SubmitEvent, ReactNode } from 'react'

const CARD = 'settings-width flex flex-col gap-5 rounded-2xl border border-border bg-card p-6'

interface FormCardProps {
  /** The top bar's Save button submits it with `form={id}`. */
  id: string
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void
  children: ReactNode
}

/** A settings form on its card (General pages). Stops at `--settings-max-width` on wide screens. */
export function FormCard({ id, onSubmit, children }: FormCardProps) {
  return (
    <form id={id} onSubmit={onSubmit} className={CARD}>
      {children}
    </form>
  )
}

/**
 * The same card around content that holds more than one form, which can't
 * nest (Profile's name and its email change).
 */
export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className={CARD}>{children}</div>
}
