import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { BreadcrumbItem } from './breadcrumb'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
}

/**
 * Fixed 64px full-bleed header band. The height matches the sidebar's scope
 * switcher section so the two hairline dividers align across the app.
 * Breadcrumbs render inline before the title as path segments.
 */
export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="-mx-6 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border px-6 md:-mx-8 md:px-8">
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-1.5">
          {breadcrumbs?.map((item) => (
            <span
              key={item.label}
              className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground/60"
            >
              {item.href ? (
                <Link to={item.href} className="transition-colors hover:text-muted-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className="max-w-[200px] truncate">{item.label}</span>
              )}
              <span className="text-muted-foreground/40">/</span>
            </span>
          ))}
          <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
        </div>
        {description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
