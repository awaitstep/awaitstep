import type { VariableTarget } from './variable-dialog'

interface TargetsInput {
  project: { slug: string; name: string; canManage: boolean }
  /** Each workspace, with whether the viewer may set its variables. */
  workspaces: { slug: string; name: string; canManage: boolean }[]
}

/** The org as a place to set variables: "Acme Inc · every project". */
export function orgVariableTarget(orgName: string): VariableTarget {
  return {
    id: 'org',
    label: orgName,
    description: 'Every project',
    kind: 'organization',
    name: orgName,
    scope: { level: 'organization' },
  }
}

/**
 * The "Applies to" choices (`NewVariable`) from a project page: the project,
 * then each workspace — only the ones the viewer may change (D-P6-7). Never
 * the org: that level is set from the org's own page.
 */
export function variableTargets({ project, workspaces }: TargetsInput): VariableTarget[] {
  const targets: VariableTarget[] = []
  if (project.canManage) {
    targets.push({
      id: 'project',
      label: project.name,
      description: 'Every workspace in this project',
      kind: 'project',
      name: project.name,
      scope: { level: 'project', project: project.slug },
    })
  }
  for (const workspace of workspaces) {
    if (!workspace.canManage) continue
    targets.push({
      id: `ws:${workspace.slug}`,
      label: workspace.name,
      description: 'Only this workspace',
      kind: 'workspace',
      name: workspace.name,
      scope: { level: 'workspace', project: project.slug, workspace: workspace.slug },
    })
  }
  return targets
}
