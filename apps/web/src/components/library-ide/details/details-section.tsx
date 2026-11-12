import type { ReactNode } from 'react'

/** One titled block of the Details pane. */
export function DetailsSection({
  title,
  action,
  note,
  children,
}: {
  title: string
  action?: ReactNode
  note?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
      {note && <p className="text-2xs leading-relaxed text-muted-foreground">{note}</p>}
    </section>
  )
}
