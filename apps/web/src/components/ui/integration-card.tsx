import { useId, type ReactNode } from 'react'
import { hasContent } from './has-content'

interface IntegrationCardProps {
  /** The service's own mark, decorative: the title names it. */
  logo: ReactNode
  title: string
  description: string
  /** A short line under the description, e.g. "Not set up on this instance". */
  status?: ReactNode
  /** The card's buttons, at its foot. */
  actions?: ReactNode
}

/** One service on an Integrations page: logo, name, a line about it and its buttons, a square-ish tile in a grid. */
export function IntegrationCard({
  logo,
  title,
  description,
  status,
  actions,
}: IntegrationCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-[200px] flex-col gap-3 rounded border border-border bg-card p-5"
    >
      <div className="flex size-10 items-center justify-center [&_svg]:size-10">{logo}</div>
      <div className="flex flex-1 flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {hasContent(status) && <p className="text-xs text-muted-foreground">{status}</p>}
      </div>
      {hasContent(actions) && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
    </section>
  )
}
