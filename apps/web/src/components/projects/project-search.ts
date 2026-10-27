import type { Project } from '../../types/dashboard/projects'

/** Projects whose name, or one of whose workspaces' names, contains the query. */
export function filterProjects(projects: Project[], query: string): Project[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return projects
  return projects.filter(
    (project) =>
      project.name.toLowerCase().includes(needle) ||
      project.workspaces.some((workspace) => workspace.name.toLowerCase().includes(needle)),
  )
}
