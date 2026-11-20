import { useId, type ReactNode } from 'react'
import { Cloud } from 'lucide-react'
import { SettingsCard } from '../ui/form-card'
import { SectionHeader } from '../ui/section-header'
import { Tile } from '../ui/tile'

interface AccountSettingCardProps {
  title: string
  /** The account, or what stands in for it (loading, none, an error). */
  children: ReactNode
  /** Change; absent for someone who may only read it. */
  action?: ReactNode
}

/** A Settings section naming the Cloudflare account something deploys to. */
export function AccountSettingCard({ title, children, action }: AccountSettingCardProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SettingsCard>
        <SectionHeader id={titleId} title={title} />
        <div className="flex flex-wrap items-center gap-3">
          <Tile tone="warn" size="sm" className="size-9">
            <Cloud aria-hidden="true" />
          </Tile>
          <div className="flex min-w-[200px] flex-1 flex-col gap-0.5 text-sm">{children}</div>
          {action}
        </div>
      </SettingsCard>
    </section>
  )
}
