import type { ApiLibraryRow } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { Badge } from '../../ui/badge'
import { DataTable, type DataColumn } from '../../ui/data-table'
import { ShellLink } from '../../ui/shell-link'
import { KIND_PILL, usedByLabel, versionLabel } from '../library-format'
import { LibraryKindTile } from './library-kind-tile'
import { LibraryRowMenu, type LibraryRowAction } from './library-row-menu'

interface LibraryTableProps {
  caption: string
  rows: ApiLibraryRow[]
  empty: string
  /** Where each row opens: the IDE of the place that owns it. */
  hrefOf: (row: ApiLibraryRow) => string
  /** Rows owned elsewhere (the project's, in a workspace): no menu, an origin column. */
  readOnly?: boolean
  canEdit?: boolean
  onOpen?: (row: ApiLibraryRow) => void
  onAction?: (action: LibraryRowAction, row: ApiLibraryRow) => void
}

function NameCell({ row, href }: { row: ApiLibraryRow; href: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <LibraryKindTile kind={row.kind} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <ShellLink
            href={href}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {row.name}
          </ShellLink>
          <Badge variant="neutral">{KIND_PILL[row.kind]}</Badge>
        </span>
        {row.description && (
          <span className="truncate text-2xs text-muted-foreground">{row.description}</span>
        )}
      </span>
    </span>
  )
}

function VersionCell({ row }: { row: ApiLibraryRow }) {
  if (row.latestVersion === null) return <Badge variant="neutral">draft</Badge>
  return (
    <span className="font-mono text-xs text-foreground">{versionLabel(row.latestVersion)}</span>
  )
}

/** A Library section's rows (28a): name, version, who uses it, when it changed. */
export function LibraryTable({
  caption,
  rows,
  empty,
  hrefOf,
  readOnly = false,
  canEdit = false,
  onOpen,
  onAction,
}: LibraryTableProps) {
  const columns: DataColumn<ApiLibraryRow>[] = [
    { id: 'name', header: 'Name', cell: (row) => <NameCell row={row} href={hrefOf(row)} /> },
    { id: 'version', header: 'Version', width: '110px', cell: (row) => <VersionCell row={row} /> },
    {
      id: 'used',
      header: 'Used by',
      width: '140px',
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{usedByLabel(row.usedBy)}</span>
      ),
    },
  ]
  if (readOnly) {
    columns.push({
      id: 'origin',
      header: 'From',
      width: '140px',
      cell: (row) => <span className="text-xs text-muted-foreground">{row.owner.name}</span>,
    })
  } else {
    columns.push(
      {
        id: 'updated',
        header: 'Updated',
        width: '120px',
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{timeAgoOrDay(row.updatedAt)}</span>
        ),
      },
      {
        id: 'menu',
        header: '',
        width: '56px',
        align: 'right',
        cell: (row) =>
          onOpen && onAction ? (
            <LibraryRowMenu row={row} canEdit={canEdit} onOpen={onOpen} onAction={onAction} />
          ) : null,
      },
    )
  }
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.id}
      empty={empty}
      minWidth="680px"
      framed={false}
    />
  )
}
