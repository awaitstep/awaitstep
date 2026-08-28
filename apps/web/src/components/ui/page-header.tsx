import type { ReactNode } from 'react'
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-border pb-3">
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
