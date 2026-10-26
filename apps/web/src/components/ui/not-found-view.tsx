import { SearchX } from 'lucide-react'
import { buttonVariants } from './button'
import { ShellLink } from './shell-link'
import { Tile } from './tile'

export type NotFoundKind = 'organization' | 'project' | 'workspace' | 'page'

interface NotFoundLink {
  label: string
  href: string
}

interface NotFoundViewProps {
  kind: NotFoundKind
  /** The slug from the URL, e.g. "finance". */
  name: string
  /** Where it was looked for, e.g. "Project 101". Left out for organizations. */
  parentName?: string
  /** The path that was opened, e.g. "/acme/project-101/finance". */
  path: string
  primary: NotFoundLink
  secondary?: NotFoundLink
}

function whereClause(parentName: string | undefined): string {
  return parentName ? ` in ${parentName}` : ''
}

/**
 * The same page for a scope that doesn't exist and one the person can't open,
 * so a hidden workspace's name never leaks.
 */
export function NotFoundView({
  kind,
  name,
  parentName,
  path,
  primary,
  secondary,
}: NotFoundViewProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <Tile size="lg">
        <SearchX />
      </Tile>
      <h1 className="text-2xl font-semibold text-foreground">We can’t find that {kind}</h1>
      <p className="max-w-[460px] text-sm leading-relaxed text-muted-foreground">
        There’s no {kind} called <b className="font-semibold text-foreground">{name}</b>
        {whereClause(parentName)} that you can open. It may have been renamed or deleted, or the
        link is wrong.
      </p>
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
        {path}
      </code>
      <div className="flex flex-wrap justify-center gap-2.5">
        <ShellLink href={primary.href} className={buttonVariants()}>
          {primary.label}
        </ShellLink>
        {secondary && (
          <ShellLink href={secondary.href} className={buttonVariants({ variant: 'outline' })}>
            {secondary.label}
          </ShellLink>
        )}
      </div>
    </div>
  )
}
