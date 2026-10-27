import type { VariableTarget } from './variable-dialog'

interface TargetsInput {
  org: { name: string; canManage: boolean }
  project: { slug: string; name: string; canManage: boolean }
  /** Each workspace, with whether the viewer may set its variables. */
  workspaces: { slug: string; name: string; canManage: boolean }[]
}

/**
 * The "Applies to" choices (`NewVariable`): the org, the project, then each
 * workspace — only the ones the viewer may change (D-P6-7).
 */
export function variableTargets({ org, project, workspaces }: TargetsInput): VariableTarget[] {
  const targets: VariableTarget[] = []
  if (org.canManage) {
    targets.push({
      id: 'org',
      label: `${org.name} · every project`,
      name: org.name,
      scope: { level: 'organization' },
    })
  }
  if (project.canManage) {
    targets.push({
      id: 'project',
      label: `${project.name} · every workspace`,
      name: project.name,
      scope: { level: 'project', project: project.slug },
    })
  }
  for (const workspace of workspaces) {
    if (!workspace.canManage) continue
    targets.push({
      id: `ws:${workspace.slug}`,
      label: `${workspace.name} only`,
      name: workspace.name,
      scope: { level: 'workspace', project: project.slug, workspace: workspace.slug },
    })
  }
  return targets
}
