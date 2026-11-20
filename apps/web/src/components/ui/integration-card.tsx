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
      className="flex flex-col shadow-xs rounded border border-border bg-card p-5"
    >
      <span className="w-fit [&_svg]:size-8">{logo}</span>

      <div className="flex flex-1 flex-col">
        <h2 id={titleId} className="text-sm font-semibold mb-0">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
        {hasContent(status) && <p className="text-xs text-muted-foreground">{status}</p>}
      </div>
      {hasContent(actions) && (
        <div className="flex flex-wrap items-center gap-1 mt-5">{actions}</div>
      )}
    </section>
  )
}
