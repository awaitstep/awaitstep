import type { ApiLibrarySummary } from '../../../lib/library-api'
import { DataTable, type DataColumn } from '../../ui/data-table'
import { LibraryKindTile } from './library-kind-tile'

type MarketplaceRow = ApiLibrarySummary['marketplace'][number]

const COLUMNS: DataColumn<MarketplaceRow>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-3">
        <LibraryKindTile kind="node" />
        <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
      </span>
    ),
  },
  {
    id: 'version',
    header: 'Version',
    width: '110px',
    cell: (row) => <span className="font-mono text-xs text-foreground">v{row.version}</span>,
  },
]

/** The organization's installed marketplace nodes, read-only (28b). */
export function MarketplaceTable({ rows }: { rows: MarketplaceRow[] }) {
  return (
    <DataTable
      caption="Installed marketplace nodes"
      columns={COLUMNS}
      rows={rows}
      getRowKey={(row) => row.nodeId}
      empty="No marketplace nodes installed."
      minWidth="480px"
      framed={false}
    />
  )
}
