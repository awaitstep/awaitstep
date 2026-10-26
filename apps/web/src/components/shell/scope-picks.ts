/** A project the picker offers. Without `workspaces`, only whole projects can be picked. */
export interface PickerProject {
  id: string
  name: string
  /** The row's right-hand note: "3 workspaces". Defaults to "Project". */
  meta?: string
  workspaces?: { id: string; name: string }[]
}

export interface ScopeOption {
  /** `p:<projectId>` or `ws:<projectId>:<workspaceId>`. */
  id: string
  kind: 'project' | 'workspace'
  projectId: string
  /** The row's text: "Project 101 · every workspace", "Sales". */
  label: string
  /** The chip's text, which has to stand on its own: "Project 101 › Sales". */
  chip: string
  meta: string
}

export function projectPickId(projectId: string): string {
  return `p:${projectId}`
}

export function workspacePickId(projectId: string, workspaceId: string): string {
  return `ws:${projectId}:${workspaceId}`
}

/** Every pickable row, each project followed by its workspaces. */
export function scopeOptions(projects: PickerProject[]): ScopeOption[] {
  return projects.flatMap((project) => {
    const whole = project.workspaces ? `${project.name} · every workspace` : project.name
    const projectOption: ScopeOption = {
      id: projectPickId(project.id),
      kind: 'project',
      projectId: project.id,
      label: whole,
      chip: whole,
      meta: project.meta ?? 'Project',
    }
    const workspaceOptions = (project.workspaces ?? []).map((workspace): ScopeOption => ({
      id: workspacePickId(project.id, workspace.id),
      kind: 'workspace',
      projectId: project.id,
      label: workspace.name,
      chip: `${project.name} › ${workspace.name}`,
      meta: 'Workspace',
    }))
    return [projectOption, ...workspaceOptions]
  })
}

/** A workspace whose whole project is picked: shown ticked, and can't be toggled. */
export function isCovered(option: ScopeOption, picks: readonly string[]): boolean {
  return option.kind === 'workspace' && picks.includes(projectPickId(option.projectId))
}

/**
 * `picks` with `option` added or removed. Picking a project drops its
 * workspace picks, since the project covers them; a covered row changes nothing.
 */
export function togglePick(picks: readonly string[], option: ScopeOption): string[] {
  if (isCovered(option, picks)) return [...picks]
  if (picks.includes(option.id)) return picks.filter((id) => id !== option.id)
  if (option.kind === 'workspace') return [...picks, option.id]
  const workspacePrefix = `ws:${option.projectId}:`
  return [...picks.filter((id) => !id.startsWith(workspacePrefix)), option.id]
}

/** Rows whose text contains the query, matching workspaces by "Project › Workspace" too. */
export function filterOptions(options: ScopeOption[], query: string): ScopeOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return options
  return options.filter((option) => option.chip.toLowerCase().includes(needle))
}
