import { useId } from 'react'
import { Lock } from 'lucide-react'
import type { OrgRole, Person } from '../../../types/dashboard/session'
import { ORG_ROLE_LABEL } from './access-draft'
import { Avatar } from '../../ui/avatar'
import { buttonVariants } from '../../ui/button'
import { ShellLink } from '../../ui/shell-link'

export interface AccessGiver {
  person: Person
  role: OrgRole
}

interface NoAccessPanelProps {
  /** Says what they can't see, e.g. "You can’t see the audit log". */
  title: string
  /** What it holds and why it is kept, e.g. "It lists sign-ins … so it’s kept to owners and admins." */
  why: string
  orgName: string
  viewerRole: OrgRole
  /** The org's owners and admins, by name; undefined while they load. */
  givers: AccessGiver[] | undefined
  /** Where "Back to projects" goes. */
  backHref: string
}

// The redacted rows' bar widths, as the board draws them: the list is there, its words aren't.
const REDACTED_ROWS = [
  { title: '58%', detail: '34%' },
  { title: '44%', detail: '29%' },
  { title: '66%', detail: '38%' },
  { title: '38%', detail: '24%' },
]

// Fades the redacted rows into the card under the panel's words.
const FADE = {
  background:
    'linear-gradient(180deg, color-mix(in oklab, var(--card) 10%, transparent) 0%, color-mix(in oklab, var(--card) 72%, transparent) 20%, var(--card) 34%)',
}

function giversHeading(count: number): string {
  if (count === 1) return 'They can give you access'
  return count === 2 ? 'Either of these can give you access' : 'Any of these can give you access'
}

/**
 * A list someone may not see (board `LayoutRules` §3 "Cannot see it at all";
 * `AuditLog` Member view): the list is replaced by the same list redacted, so
 * the page shows what is withheld; on top, what it is, why it is kept, the
 * role they hold and who can change that, by name. Neutral, never a blue tip.
 */
export function NoAccessPanel({
  title,
  why,
  orgName,
  viewerRole,
  givers,
  backHref,
}: NoAccessPanelProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div aria-hidden="true" className="absolute inset-0 px-[22px] pt-3.5">
        {REDACTED_ROWS.map((row, i) => (
          <div
            key={row.title}
            className={`flex items-center gap-3.5 py-[13px] ${i < REDACTED_ROWS.length - 1 ? 'border-b border-border' : ''}`}
          >
            <span className="size-[34px] shrink-0 rounded-[10px] bg-muted" />
            <span className="flex min-w-0 flex-1 flex-col gap-[7px]">
              <span className="h-[9px] rounded-full bg-muted" style={{ width: row.title }} />
              <span className="h-[7px] rounded-full bg-muted/60" style={{ width: row.detail }} />
            </span>
            <span className="h-[22px] w-[92px] shrink-0 rounded-full bg-muted/60" />
            <span className="h-2 w-[54px] shrink-0 rounded-full bg-muted/60" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-0" style={FADE} />

      <div className="relative flex flex-col items-center gap-[18px] px-6 pb-12 pt-[148px] text-center">
        <span className="flex size-[50px] items-center justify-center rounded-[14px] border border-border bg-muted text-muted-foreground">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <div className="flex max-w-[460px] flex-col items-center gap-2.5">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{why}</p>
          <p className="text-xs text-muted-foreground">
            You’re {articleFor(ORG_ROLE_LABEL[viewerRole])}{' '}
            <strong className="font-semibold text-foreground">{ORG_ROLE_LABEL[viewerRole]}</strong>{' '}
            of {orgName}.
          </p>
        </div>
        {givers && givers.length > 0 && (
          <div className="flex flex-col items-center gap-2.5">
            <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {giversHeading(givers.length)}
            </h3>
            <ul
              aria-label="Who can give you access"
              className="flex flex-wrap justify-center gap-2"
            >
              {givers.map(({ person, role }) => (
                <li
                  key={person.id}
                  className="inline-flex h-[38px] items-center gap-[9px] rounded-full border border-border bg-muted pl-1 pr-3.5"
                >
                  <Avatar name={person.name} email={person.email} src={person.image} />
                  <span className="flex flex-col text-left leading-tight">
                    <span className="text-xs font-semibold text-foreground">{person.name}</span>
                    <span className="text-3xs text-muted-foreground">{ORG_ROLE_LABEL[role]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-0.5 flex flex-wrap justify-center gap-2.5">
          <ShellLink href={backHref} className={buttonVariants({ variant: 'outline' })}>
            Back to projects
          </ShellLink>
        </div>
      </div>
    </section>
  )
}

function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
