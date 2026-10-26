import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hasContent } from './has-content'

export interface DataColumn<Row> {
  id: string
  header: string
  cell: (row: Row) => ReactNode
  /** A CSS width, e.g. "120px" or "30%". Columns without one share the rest. */
  width?: string
  align?: 'left' | 'right'
}

interface DataTableProps<Row> {
  /** Names the table for screen readers; not shown. */
  caption: string
  columns: DataColumn<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
  /** Shown in place of rows when there are none. */
  empty?: ReactNode
  /** Below this the table scrolls sideways instead of squeezing, e.g. on a phone. */
  minWidth?: string
  /** Inside the card under the table, usually a `Pager`. */
  footer?: ReactNode
  /** `false` drops the card's border and fill, for use inside a `ScopedSection`. */
  framed?: boolean
}

/** A bordered table of runs, events, members or keys. */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  empty = 'Nothing here yet.',
  minWidth = '760px',
  footer,
  framed = true,
}: DataTableProps<Row>) {
  return (
    <div className={cn(framed && 'overflow-hidden rounded-2xl border border-border bg-card')}>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    'px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-8 text-center text-xs text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={getRowKey(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        'px-5 py-3 align-middle text-xs text-foreground',
                        column.align === 'right' && 'text-right',
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasContent(footer) && <div className="border-t border-border">{footer}</div>}
    </div>
  )
}
