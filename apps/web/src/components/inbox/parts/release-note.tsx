import { useId } from 'react'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import { Badge, type BadgeProps } from '../../ui/badge'
import { ShellLink } from '../../ui/shell-link'
import type { Release, ReleaseTag } from '../../../types/dashboard/inbox'

const TAG_LOOK: Record<ReleaseTag, { label: string; variant: BadgeProps['variant'] }> = {
  new: { label: 'New', variant: 'success' },
  improved: { label: 'Improved', variant: 'info' },
  fixed: { label: 'Fixed', variant: 'neutral' },
}

interface ReleaseNoteProps {
  release: Release
}

/** One entry in What's new. */
export function ReleaseNote({ release }: ReleaseNoteProps) {
  const titleId = useId()
  const tag = TAG_LOOK[release.tag]
  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-2 px-6 py-5">
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant={tag.variant}>{tag.label}</Badge>
        <time dateTime={release.date} className="text-2xs text-muted-foreground">
          {format(new Date(release.date), 'd MMM yyyy')}
        </time>
        {release.fresh && (
          <span className="text-2xs font-medium text-status-success">New to you</span>
        )}
      </span>
      <h3 id={titleId} className="text-sm font-semibold text-foreground">
        {release.title}
      </h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{release.body}</p>
      <ShellLink
        href={release.link.href}
        className="flex w-fit items-center gap-1 text-xs font-medium text-status-success hover:underline"
      >
        {release.link.label}
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </ShellLink>
    </article>
  )
}
