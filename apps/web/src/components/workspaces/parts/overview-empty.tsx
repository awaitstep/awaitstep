import type { LucideIcon } from 'lucide-react'
import { buttonVariants } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'

interface OverviewEmptyProps {
  icon: LucideIcon
  title: string
  body: string
  action: { label: string; href: string }
}

/** The inside of an Overview card with nothing in it yet (`WsOverview`, Built no runs): what will land here, and how. */
export function OverviewEmpty({ icon: Icon, title, body, action }: OverviewEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-[11px] px-6 pt-[38px] pb-[34px] text-center">
      <span className="flex size-10 items-center justify-center rounded-[11px] border border-border bg-muted text-muted-foreground">
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="text-[14.5px] font-semibold text-foreground">{title}</span>
      <span className="max-w-[430px] text-[13px] leading-relaxed text-muted-foreground">
        {body}
      </span>
      <ShellLink
        href={action.href}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-[3px]' })}
      >
        {action.label}
      </ShellLink>
    </div>
  )
}
