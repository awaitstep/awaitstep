import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'

const WIDTH_CLASS = {
  sm: 'max-w-[380px]',
  md: 'max-w-[460px]',
  lg: 'max-w-[520px]',
} as const

interface AuthCardProps {
  /** `sm` sign-in, `md` invites, `lg` choose an organization. */
  width: keyof typeof WIDTH_CLASS
  /** The page's `h1`. */
  title: string
  /** Above the title, e.g. "Ama Mensah invited you to". */
  eyebrow?: ReactNode
  lead?: ReactNode
  /** The org's initial tile, before the eyebrow and title. */
  avatar?: ReactNode
  children?: ReactNode
  /** The button row at the foot. */
  actions?: ReactNode
}

/** The centred column inside `AuthLayout`: heading, content, actions. */
export function AuthCard({
  width,
  title,
  eyebrow,
  lead,
  avatar,
  children,
  actions,
}: AuthCardProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex w-full flex-col gap-5.5', WIDTH_CLASS[width])}
    >
      <div className="flex items-center gap-3.5">
        {hasContent(avatar) && avatar}
        <div className="flex min-w-0 flex-col gap-1.5">
          {hasContent(eyebrow) && <span className="text-xs text-muted-foreground">{eyebrow}</span>}
          <h1 id={titleId} className="text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {hasContent(lead) && (
            <p className="text-sm leading-relaxed text-muted-foreground">{lead}</p>
          )}
        </div>
      </div>
      {hasContent(children) && children}
      {hasContent(actions) && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </section>
  )
}

export interface Fact {
  key: string
  /** An avatar, tile or icon. */
  leading: ReactNode
  /** "Workspace", "Signed in as". */
  label: string
  value: ReactNode
  /** "in Project 101", "Build, run and deploy workflows". */
  sub?: ReactNode
  /** "Not you?" link, "Expired" pill. */
  trailing?: ReactNode
}

/** The boxed facts on an invite: where it leads, the role, who is signed in. */
export function FactList({ items }: { items: Fact[] }) {
  return (
    <div role="list" className="overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item) => (
        <div
          key={item.key}
          role="listitem"
          className="flex items-center gap-3.5 border-b border-border px-4 py-3.5 last:border-b-0"
        >
          {item.leading}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-2xs text-muted-foreground">{item.label}</span>
            <span className="truncate text-sm font-medium text-foreground">{item.value}</span>
            {hasContent(item.sub) && (
              <span className="text-2xs text-muted-foreground">{item.sub}</span>
            )}
          </div>
          {hasContent(item.trailing) && item.trailing}
        </div>
      ))}
    </div>
  )
}
