import { Cloud, MoreHorizontal } from 'lucide-react'
import type { ProjectConnection } from '../../../types/dashboard/project-connections'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { Tile } from '../../ui/tile'
import { tokenStatus } from '../../org-settings/parts/connection-card'
import { accountMeta, deployedFromText, scopeLabel, usageText } from '../project-connections-copy'

interface AccountRowProps {
  connection: ProjectConnection
  orgName: string
  /** Without it the row is read-only. */
  actions?: {
    onMakeDefault: () => void
    onReplaceToken: () => void
    onReconnect?: () => void
    onRemove: () => void
  }
  /** A default change in flight: the other rows' Make default waits for it. */
  busy?: boolean
  now?: Date
}

/** One account on a project's Connections page (`ProjectConnections`). */
export function AccountRow({
  connection,
  orgName,
  actions,
  busy,
  now = new Date(),
}: AccountRowProps) {
  const health = connection.available
    ? tokenStatus(connection, now)
    : { text: 'No longer available here', variant: 'error' as const, needsReconnect: false }
  const owned = connection.scope === 'project'
  const needsReconnect = health.needsReconnect === true
  return (
    <li aria-label={connection.name} className="flex flex-col gap-3.5 px-5 py-[18px]">
      <div className="flex flex-wrap items-center gap-3.5">
        <Tile tone="warn" size="md">
          <Cloud />
        </Tile>
        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {connection.name}
            {connection.isDefault && (
              <Badge variant="success" className="uppercase tracking-wide">
                Default
              </Badge>
            )}
            <Badge variant={owned ? 'info' : 'neutral'}>{scopeLabel(connection, orgName)}</Badge>
          </span>
          <span className="text-xs text-muted-foreground">{accountMeta(connection)}</span>
        </span>
        <Badge variant={health.variant} dot className="font-normal">
          {health.text}
        </Badge>
        {actions && !connection.isDefault && connection.available && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={actions.onMakeDefault}
          >
            Make default
          </Button>
        )}
        {actions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`More actions for ${connection.name}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {owned && connection.authKind !== 'oauth' && (
                <DropdownMenuItem onSelect={actions.onReplaceToken}>
                  Replace token…
                </DropdownMenuItem>
              )}
              {owned &&
                connection.authKind === 'oauth' &&
                needsReconnect &&
                actions.onReconnect && (
                  <DropdownMenuItem onSelect={actions.onReconnect}>Reconnect…</DropdownMenuItem>
                )}
              <DropdownMenuItem onSelect={actions.onRemove}>
                {owned ? 'Delete account…' : 'Remove from project…'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3.5 text-xs text-muted-foreground">
        <span>{deployedFromText(connection.deployedFrom)}</span>
        <span className="flex-1" />
        <span>{usageText(connection.deployments, now)}</span>
      </div>
    </li>
  )
}
