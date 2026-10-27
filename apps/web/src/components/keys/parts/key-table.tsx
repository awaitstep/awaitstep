import { KeyRound, MoreHorizontal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ApiKey } from '../../../types/dashboard/api-keys'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { DataTable, type DataColumn } from '../../ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import { Tile } from '../../ui/tile'
import { expiryLabel, lastUsedLabel } from './key-format'
import { describeGrants } from './key-permissions'

const CHIPS_SHOWN = 2

interface KeyTableProps {
  caption: string
  keys: ApiKey[]
  /** Without it the table is read-only: no Revoke, no menu. */
  onRevoke?: (key: ApiKey) => void
  onCopyPrefix?: (key: ApiKey) => void
  empty?: string
  /** Inside a titled card. */
  framed?: boolean
  now?: Date
}

function Permissions({ apiKey }: { apiKey: ApiKey }) {
  const grants = describeGrants(apiKey.level, apiKey.permissions)
  const hidden = grants.length - CHIPS_SHOWN
  return (
    <span className="flex flex-wrap gap-1.5">
      {grants.slice(0, CHIPS_SHOWN).map((grant) => (
        <Badge key={grant} className="font-normal">
          {grant}
        </Badge>
      ))}
      {hidden > 0 && <Badge className="font-normal text-muted-foreground">+{hidden}</Badge>}
    </span>
  )
}

/** A level's API keys (`KeysPage`): name and prefix, permissions, who made it, use and expiry. */
export function KeyTable({
  caption,
  keys,
  onRevoke,
  onCopyPrefix,
  empty = 'No keys yet.',
  framed = true,
  now = new Date(),
}: KeyTableProps) {
  const columns: DataColumn<ApiKey>[] = [
    {
      id: 'key',
      header: 'Key',
      cell: (key) => (
        <span className="flex min-w-0 items-center gap-3">
          <Tile tone="warn" size="sm">
            <KeyRound />
          </Tile>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-foreground">{key.name}</span>
            <span className="truncate font-mono text-2xs text-muted-foreground">{key.prefix}</span>
          </span>
        </span>
      ),
    },
    { id: 'permissions', header: 'Permissions', cell: (key) => <Permissions apiKey={key} /> },
    {
      id: 'by',
      header: 'Created by',
      width: '130px',
      cell: (key) => <span className="text-xs text-muted-foreground">{key.createdBy.name}</span>,
    },
    {
      id: 'used',
      header: 'Last used',
      width: '120px',
      cell: (key) => (
        <span className="text-xs text-muted-foreground">{lastUsedLabel(key.lastUsedAt, now)}</span>
      ),
    },
    {
      id: 'expires',
      header: 'Expires',
      width: '120px',
      cell: (key) => {
        const expiry = expiryLabel(key.expiresAt, now)
        return (
          <span
            className={cn('text-xs', expiry.soon ? 'text-status-warning' : 'text-muted-foreground')}
          >
            {expiry.text}
          </span>
        )
      },
    },
  ]
  if (onRevoke) {
    columns.push({
      id: 'actions',
      header: 'Actions',
      width: '130px',
      cell: (key) => (
        <span className="flex items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(key)}>
            Revoke
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Actions for ${key.name}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onCopyPrefix && (
                <DropdownMenuItem onSelect={() => onCopyPrefix(key)}>Copy prefix</DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onRevoke(key)}>Revoke…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
    })
  }
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={keys}
      getRowKey={(key) => key.id}
      empty={empty}
      minWidth="900px"
      framed={framed}
    />
  )
}
