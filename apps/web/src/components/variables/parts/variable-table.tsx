import { Fragment } from 'react'
import type { WorkspaceRef } from '../../../types/dashboard/items'
import type { ResolvedVariable } from '../../../types/dashboard/variables'
import { DataTable, type DataColumn } from '../../ui/data-table'
import { ShellLink } from '../../ui/shell-link'

const SECRET_MASK = '••••••••'

interface VariableTableProps {
  caption: string
  variables: ResolvedVariable[]
  /** Where "Overridden in Sales" leads. */
  overrideHref: (workspace: WorkspaceRef) => string
  /** Edit (set here) or Override (inherited); without it the table is read-only. */
  actionHref?: (variable: ResolvedVariable) => string
  framed?: boolean
}

function Notes({
  variable,
  overrideHref,
}: {
  variable: ResolvedVariable
  overrideHref: (workspace: WorkspaceRef) => string
}) {
  const notes = []
  if (variable.isSecret) notes.push(<span key="secret">Secret</span>)
  if (variable.setAt.level === 'organization') notes.push(<span key="org">From the org</span>)
  for (const workspace of variable.overriddenIn) {
    notes.push(
      <ShellLink
        key={workspace.id}
        href={overrideHref(workspace)}
        className="text-status-success hover:underline"
      >
        Overridden in {workspace.name}
      </ShellLink>,
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      {notes.map((note, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {note}
        </Fragment>
      ))}
    </span>
  )
}

/** Variables as a scope resolves them (`ProjectVariables`): name, value, where it's set, notes. */
export function VariableTable({
  caption,
  variables,
  overrideHref,
  actionHref,
  framed = true,
}: VariableTableProps) {
  const columns: DataColumn<ResolvedVariable>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: (v) => (
        <span className="font-mono text-xs font-semibold text-foreground">{v.name}</span>
      ),
    },
    {
      id: 'value',
      header: 'Value',
      cell: (v) => (
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {v.isSecret ? <span aria-label="Hidden secret value">{SECRET_MASK}</span> : v.value}
        </span>
      ),
    },
    {
      id: 'set',
      header: 'Set at',
      width: '140px',
      cell: (v) => <span className="text-xs text-foreground/90">{v.setAt.name}</span>,
    },
    {
      id: 'notes',
      header: 'Notes',
      cell: (v) => <Notes variable={v} overrideHref={overrideHref} />,
    },
  ]
  if (actionHref) {
    columns.push({
      id: 'action',
      header: '',
      width: '100px',
      cell: (v) => (
        <ShellLink
          href={actionHref(v)}
          className="text-xs font-medium text-status-success hover:underline"
        >
          {v.setAt.level === 'organization' ? 'Override' : 'Edit'}
        </ShellLink>
      ),
    })
  }
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={variables}
      getRowKey={(v) => v.name}
      empty="No variables yet."
      minWidth="760px"
      framed={framed}
    />
  )
}
