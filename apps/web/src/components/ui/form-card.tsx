import type { FormEvent, ReactNode } from 'react'

interface FormCardProps {
  /** The top bar's Save button submits it with `form={id}`. */
  id: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

/** A settings form on its card (General pages). Stops at `--settings-max-width` on wide screens. */
export function FormCard({ id, onSubmit, children }: FormCardProps) {
  return (
    <form
      id={id}
      onSubmit={onSubmit}
      className="settings-width flex flex-col gap-5 rounded-2xl border border-border bg-card p-6"
    >
      {children}
    </form>
  )
}
