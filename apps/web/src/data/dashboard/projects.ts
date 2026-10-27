import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { NewProjectInput, ProjectUpdate } from '../../types/dashboard/projects'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'
import { useScope } from './workspaces'

/** `enabled: false` holds the request back, for a frame that needs the list on one page only. */
export function useProjects(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projects(org), ctx),
    queryFn: () => mockServer.projects.listProjects(ctx, org),
    enabled,
  })
}

/** The project scope a URL names (or its not-found result). */
export function useProject(org: string, project: string) {
  return useScope({ org, project })
}

const projectKeys = (org: string) => [dashKeys.projects(org), dashKeys.orgs(), dashKeys.scope()]

/** Everything read through one project, for a change to its slug, org or existence. */
const throughProject = (org: string, project: string) => [
  dashKeys.inProject('workspaces', org, project),
  dashKeys.items(org, project),
  dashKeys.shared(org, project),
  dashKeys.runs(org, project),
  dashKeys.setup(org, project),
  dashKeys.inProject('keys', org, project),
  dashKeys.inProject('variables', org, project),
  dashKeys.inProject('members', org, project),
]

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
        [...projectKeys(org), ...throughProject(org, project)],
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
          ...throughProject(org, project),
          dashKeys.failing(org),
          dashKeys.activity(org),
        ],
        { org, project },
      ),
  })
}

/** Moves the project to another org; resolves to its new slugs, for the page to follow. */
export function useMoveProject(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (toOrg: string) => mockServer.projects.moveProject(ctx, org, project, toOrg),
    onSuccess: (moved) =>
      invalidateAll(
        client,
        [
          ...projectKeys(org),
          ...projectKeys(moved.org),
          ...throughProject(org, project),
          dashKeys.failing(org),
          dashKeys.activity(org),
          // The org it moved into now shows its failures and activity.
          dashKeys.failing(moved.org),
          dashKeys.activity(moved.org),
        ],
        { org, project },
      ),
  })
}
