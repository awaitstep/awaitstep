import { Check, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { KeyLevel } from '../../../types/dashboard/api-keys'
import { Badge } from '../../ui/badge'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'

interface LevelInfo {
  name: string
  glyph: string
  tone: 'info' | 'neutral' | 'ok'
  can: string[]
  cant: string
}

const LEVELS: Record<KeyLevel, LevelInfo> = {
  organization: {
    name: 'Organization keys',
    glyph: 'A',
    tone: 'info',
    can: ['Create and manage projects', 'Invite members, manage connections and resources'],
    cant: 'Read, change, deploy or run workflows',
  },
  project: {
    name: 'Project keys',
    glyph: 'P',
    tone: 'neutral',
    can: ['Everything in one project', 'Every workspace, including new ones'],
    cant: 'Other projects, or org settings',
  },
  workspace: {
    name: 'Workspace keys',
    glyph: 'S',
    tone: 'ok',
    can: ['One workspace: its workflows, runs, variables', 'Call workflows other workspaces share'],
    cant: 'Other workspaces in the project',
  },
}

const ORDER: KeyLevel[] = ['organization', 'project', 'workspace']

interface KeyLevelCardsProps {
  /** The level whose keys the page lists: "You're here". */
  current: KeyLevel
  /** Where each other level's keys live, and the link's words ("Org keys"). */
  links: Partial<Record<KeyLevel, { href: string; label: string }>>
}

/** The three key levels side by side, above every keys list (`KeysPage`). */
export function KeyLevelCards({ current, links }: KeyLevelCardsProps) {
  return (
    <ul aria-label="Key levels" className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {ORDER.map((level) => {
        const info = LEVELS[level]
        const here = level === current
        const link = links[level]
        const ariaCurrent = here ? 'true' : undefined
        return (
          <li
            key={level}
            aria-current={ariaCurrent}
            className={cn(
              'flex flex-col gap-3.5 rounded-2xl border p-4.5',
              here ? 'border-primary/50 bg-primary/5' : 'border-border bg-card',
            )}
          >
            <span className="flex items-center gap-3">
              <Tile tone={info.tone} size="sm">
                {info.glyph}
              </Tile>
              <span className="flex-1 text-sm font-semibold text-foreground">{info.name}</span>
              {here && (
                <Badge variant="success" dot>
                  You’re here
                </Badge>
              )}
            </span>
            <span className="flex flex-col gap-1.5 text-xs text-foreground/90">
              {info.can.map((line) => (
                <span key={line} className="flex items-start gap-2">
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-status-success"
                    aria-hidden="true"
                  />
                  {line}
                </span>
              ))}
              <span className="flex items-start gap-2 text-muted-foreground">
                <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="sr-only">Can’t: </span>
                  {info.cant}
                </span>
              </span>
            </span>
            {!here && link && (
              <ShellLink
                href={link.href}
                className="mt-auto text-xs font-medium text-status-success hover:underline"
              >
                {link.label} →
              </ShellLink>
            )}
          </li>
        )
      })}
    </ul>
  )
}
