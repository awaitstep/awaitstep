import { useMemo } from 'react'
import { useProjects } from '../../data/dashboard/projects'
import { plural } from '../../lib/plural'
import { variableDialogPath } from '../../lib/dashboard-paths'
import type { OrgVariable } from '../../types/dashboard/variables'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { OverviewCard } from '../workspaces/parts/overview-card'
import { VariableDialog } from '../variables/variable-dialog'
import { orgDialogMode, type VariableRequest } from '../variables/variable-requests'
import { orgVariableTarget } from '../variables/variable-targets'

const SECRET_MASK = '••••••••'

function notes(variable: OrgVariable): string {
  const parts = []
  if (variable.isSecret) parts.push('Secret')
  if (variable.overriddenIn > 0) {
    parts.push(`Overridden in ${plural(variable.overriddenIn, 'project')}`)
  }
  return parts.join(' · ')
}

function variableColumns(org: string, canManage: boolean): DataColumn<OrgVariable>[] {
  const columns: DataColumn<OrgVariable>[] = [
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
      id: 'notes',
      header: 'Notes',
      cell: (v) => <span className="text-xs text-muted-foreground">{notes(v)}</span>,
    },
  ]
  if (canManage) {
    columns.push({
      id: 'action',
      header: '',
      width: '80px',
      cell: (v) => (
        <ShellLink
          href={variableDialogPath({ org }, { kind: 'variable', name: v.name })}
          className="text-xs font-medium text-status-success hover:underline"
        >
          Edit
        </ShellLink>
      ),
    })
  }
  return columns
}

interface OrgVariablesTabProps {
  org: { slug: string; name: string }
  variables: OrgVariable[]
  /** Org owners and admins add and edit them (D-P7-5). */
  canManage: boolean
  request: VariableRequest | null
  onCloseDialog: () => void
}

/** Resources → Variables (`OrgResources`): what reaches every project unless it sets its own. */
export function OrgVariablesTab({
  org,
  variables,
  canManage,
  request,
  onCloseDialog,
}: OrgVariablesTabProps) {
  // Built once per org and role, so the table keeps the same columns between renders.
  const columns = useMemo(() => variableColumns(org.slug, canManage), [org.slug, canManage])
  const mode = canManage ? orgDialogMode(request, variables) : null
  // The projects the variable can be limited to, loaded only once the dialog is open.
  const projects = useProjects(org.slug, { enabled: mode !== null })
  const projectOptions = (projects.data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
  }))

  return (
    <>
      <OverviewCard
        title={org.name}
        caption="Used by every project unless a project or workspace overrides them."
      >
        <DataTable
          caption={`Variables in ${org.name}`}
          columns={columns}
          rows={variables}
          getRowKey={(v) => v.name}
          empty="No org variables yet."
          minWidth="640px"
          framed={false}
        />
      </OverviewCard>
      {mode && (
        <VariableDialog
          org={org.slug}
          mode={mode}
          target={orgVariableTarget(org.name)}
          places={{ noun: 'project', options: projectOptions }}
          onClose={onCloseDialog}
        />
      )}
    </>
  )
}
