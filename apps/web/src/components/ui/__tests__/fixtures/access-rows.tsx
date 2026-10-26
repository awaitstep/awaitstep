import { KeyRound, MoreHorizontal } from 'lucide-react'
import { Avatar } from '../../avatar'
import { Badge } from '../../badge'
import { Button } from '../../button'
import { DataTable, type DataColumn } from '../../data-table'
import { ListCard, ListRow } from '../../list-card'
import { InheritedMark } from '../../scoped-section'
import { Tile } from '../../tile'
import type { SampleKey, SampleMember } from './access'

// The member and key lists that fill a ScopedSection, shared by its stories,
// the composite stories and the tests.

export function MemberList({
  members,
  inherited,
}: {
  members: SampleMember[]
  inherited?: boolean
}) {
  return (
    <ListCard framed={false} label="Members" empty="Nobody yet.">
      {members.map((member) => (
        <ListRow
          key={member.id}
          leading={<Avatar name={member.name} />}
          title={member.name}
          description={member.email}
          trailing={
            <>
              <Badge variant="default">{member.role}</Badge>
              <span className="text-2xs text-muted-foreground">{member.active}</span>
              {!inherited && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Change role or remove ${member.name}`}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              )}
            </>
          }
        />
      ))}
    </ListCard>
  )
}

function keyColumns(inherited: boolean): DataColumn<SampleKey>[] {
  return [
    {
      id: 'key',
      header: 'Key',
      width: '26%',
      cell: (key) => (
        <span className="flex items-center gap-3">
          <Tile tone={inherited ? 'neutral' : 'warn'} size="sm">
            <KeyRound />
          </Tile>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">{key.name}</span>
            <span className="text-2xs text-muted-foreground">{key.prefix}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'permissions',
      header: 'Permissions',
      cell: (key) => (
        <span className="flex flex-wrap gap-1.5">
          {key.permissions.map((permission) => (
            <Badge key={permission}>{permission}</Badge>
          ))}
        </span>
      ),
    },
    { id: 'by', header: 'Created by', width: '120px', cell: (key) => key.createdBy },
    { id: 'used', header: 'Last used', width: '100px', cell: (key) => key.lastUsed },
    { id: 'expires', header: 'Expires', width: '100px', cell: (key) => key.expires },
    {
      id: 'actions',
      header: 'Actions',
      width: '112px',
      align: 'right',
      cell: (key) =>
        inherited ? (
          <InheritedMark />
        ) : (
          <Button variant="outline" size="sm" className="text-status-error">
            Revoke <span className="sr-only">{key.name}</span>
          </Button>
        ),
    },
  ]
}

export function KeyTable({ keys, inherited = false }: { keys: SampleKey[]; inherited?: boolean }) {
  return (
    <DataTable
      framed={false}
      caption={inherited ? 'Inherited keys' : 'Workspace keys'}
      columns={keyColumns(inherited)}
      rows={keys}
      getRowKey={(key) => key.id}
      empty="No keys."
      minWidth="860px"
    />
  )
}
