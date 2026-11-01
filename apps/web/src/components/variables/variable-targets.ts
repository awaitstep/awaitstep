import type { VariableTarget } from './variable-dialog'

/** The org as the place to set a variable: it reaches every project unless limited. */
export function orgVariableTarget(orgName: string): VariableTarget {
  return { id: 'org', kind: 'organization', name: orgName, scope: { level: 'organization' } }
}

/** A project as the place to set a variable: it reaches every workspace unless limited. */
export function projectVariableTarget(project: { slug: string; name: string }): VariableTarget {
  return {
    id: 'project',
    kind: 'project',
    name: project.name,
    scope: { level: 'project', project: project.slug },
  }
}

/** One workspace as the place to set a variable: it applies to that workspace alone. */
export function workspaceVariableTarget(
  project: { slug: string },
  workspace: { slug: string; name: string },
): VariableTarget {
  return {
    id: `ws:${workspace.slug}`,
    kind: 'workspace',
    name: workspace.name,
    scope: { level: 'workspace', project: project.slug, workspace: workspace.slug },
  }
}
