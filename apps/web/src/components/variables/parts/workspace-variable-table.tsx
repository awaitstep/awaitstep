import type { WorkspaceVariable } from '../../../types/dashboard/variables'
import { Badge } from '../../ui/badge'
import { DataTable, type DataColumn } from '../../ui/data-table'
import type { WorkspaceColour } from '../../ui/workspace-colour'
import { ScopeChip } from '../../ui/workspace-dot'
import { ShellLink } from '../../ui/shell-link'

const SECRET_MASK = '••••••••'

const OVERRIDES_NOTE = { project: 'Overrides project', organization: 'Overrides the org' } as const

interface WorkspaceVariableTableProps {
  caption: string
  variables: WorkspaceVariable[]
  /** The workspace's colour, for its own values' source chip. */
  colour: WorkspaceColour
  /** Edit (set here) or Override (inherited); without it the table is read-only. */
  actionHref?: (variable: WorkspaceVariable) => string
  framed?: boolean
}

function Source({ variable, colour }: { variable: WorkspaceVariable; colour: WorkspaceColour }) {
  if (variable.source.level === 'workspace') {
    return <ScopeChip colour={colour}>{variable.source.name}</ScopeChip>
  }
  const variant = variable.source.level === 'organization' ? 'info' : 'default'
  return (
    <Badge variant={variant} className="font-normal">
      {variable.source.name}
    </Badge>
  )
}

function note(variable: WorkspaceVariable): string {
  const notes = []
  if (variable.overrides) notes.push(OVERRIDES_NOTE[variable.overrides])
  if (variable.isSecret) notes.push('Secret')
  return notes.join(' · ')
}

/** Variables as a workspace resolves them (`Access` › Variables): value, where it's set, notes. */
export function WorkspaceVariableTable({
  caption,
  variables,
  colour,
  actionHref,
  framed = true,
}: WorkspaceVariableTableProps) {
  const columns: DataColumn<WorkspaceVariable>[] = [
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
      id: 'source',
      header: 'Set at',
      width: '150px',
      cell: (v) => <Source variable={v} colour={colour} />,
    },
    {
      id: 'note',
      header: 'Notes',
      width: '180px',
      cell: (v) => <span className="text-xs text-muted-foreground">{note(v)}</span>,
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
          {v.source.level === 'workspace' ? 'Edit' : 'Override'}
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
      empty="No variables reach this workspace yet."
      minWidth="700px"
      framed={framed}
    />
  )
}
