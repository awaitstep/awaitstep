import { KeyRound } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { ApiKey } from '../../../types/dashboard/api-keys'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { DataTable, type DataColumn } from '../../ui/data-table'
import { InheritedMark } from '../../ui/scoped-section'
import { Tile } from '../../ui/tile'
import { expiryLabel, lastUsedLabel } from './key-format'
import { describeGrants } from './key-permissions'

const CHIPS_SHOWN = 2

interface KeyTableProps {
  caption: string
  keys: ApiKey[]
  /** Without it the table is read-only: no Revoke, no menu. */
  onRevoke?: (key: ApiKey) => void
  /** Keys from a parent scope: the last column reads "Inherited" (workspace settings). */
  inherited?: boolean
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
  inherited = false,
  empty = 'No keys yet.',
  framed = true,
  now = new Date(),
}: KeyTableProps) {
  const keyTone = inherited ? 'neutral' : 'warn'
  const columns: DataColumn<ApiKey>[] = [
    {
      id: 'key',
      header: 'Key',
      cell: (key) => (
        <span className="flex min-w-0 items-center gap-3">
          <Tile tone={keyTone} size="sm">
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
  if (inherited) {
    columns.push({ id: 'inherited', header: '', width: '110px', cell: () => <InheritedMark /> })
  } else if (onRevoke) {
    columns.push({
      id: 'actions',
      header: 'Actions',
      width: '130px',
      cell: (key) => (
        <Button type="button" variant="outline" size="sm" onClick={() => onRevoke(key)}>
          Revoke
        </Button>
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
