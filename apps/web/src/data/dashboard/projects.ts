import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { NewProjectInput, ProjectUpdate } from '../../types/dashboard/projects'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'
import { useScope } from './workspaces'

export function useProjects(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projects(org), ctx),
    queryFn: () => mockServer.projects.listProjects(ctx, org),
  })
}

/** The project scope a URL names (or its not-found result). */
export function useProject(org: string, project: string) {
  return useScope({ org, project })
}

const projectKeys = (org: string) => [dashKeys.projects(org), dashKeys.orgs(), dashKeys.scope()]

/** Creates the project with its Default workspace; resolves to both, so the page can open it. */
export function useCreateProject(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewProjectInput) => mockServer.projects.createProject(ctx, org, input),
    onSuccess: () => invalidateAll(client, projectKeys(org)),
  })
}

export function useUpdateProject(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (update: ProjectUpdate) =>
      mockServer.projects.updateProject(ctx, org, project, update),
    onSuccess: (updated) =>
      invalidateAll(
        client,
        [
          ...projectKeys(org),
          dashKeys.workspaces(org, project),
          dashKeys.items(org, project),
          dashKeys.shared(org, project),
          dashKeys.runs(org, project),
        ],
        updated.slug === project ? undefined : { org, project },
      ),
  })
}

export function useDeleteProject(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.projects.deleteProject(ctx, org, project),
    onSuccess: () =>
      invalidateAll(
        client,
        [
          ...projectKeys(org),
          dashKeys.workspaces(org, project),
          dashKeys.items(org, project),
          dashKeys.shared(org, project),
          dashKeys.runs(org, project),
          dashKeys.failing(org),
        ],
        { org, project },
      ),
  })
}
