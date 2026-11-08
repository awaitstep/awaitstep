import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { slugify } from '@awaitstep/ir'
import { availableSlug } from '../../lib/available-slug'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  NewProjectInput,
  Project,
  ProjectOverviewSummary,
  ProjectUpdate,
} from '../../types/dashboard/projects'
import type { Workspace } from '../../types/dashboard/workspaces'
import { projectFromRow, toPerson, toProject, workspaceFromRow } from './api/records'
import { collectPages } from './export-pages'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useOrgs } from './session'
import { useDashKey, useDataSource } from './source'
import { useScope } from './workspaces'
import { projectAdmins } from '../../components/project-settings/project-pool'

/** `enabled: false` holds the request back, for a frame that needs the list on one page only. */
export function useProjects(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ ...useProjectsQuery(org), enabled })
}

/** The list's key and fetcher, for the hooks that read it from the cache before a write. */
function useProjectsQuery(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return {
    queryKey: key(dashKeys.projects(org)),
    queryFn: (): Promise<Project[]> =>
      source === 'api'
        ? collectPages((cursor, limit) => dashboardApi.listProjects(org, { cursor, limit })).then(
            (rows) => rows.map(toProject),
          )
        : mockServer.projects.listProjects(ctx, org),
  }
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

/** The project's id from the scope the page already resolved; a page edits what it is on. */
export function useProjectId(org: string, project: string): string | null {
  const scope = useScope({ org, project })
  return scope.data?.found ? (scope.data.project?.project.id ?? null) : null
}

/**
 * The workspaces page's three Project-wide cards, in one request. The mock
 * builds the same shape from its own lists.
 */
export function useProjectSummary(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: key(dashKeys.projectSummary(org, project)),
    queryFn: async (): Promise<ProjectOverviewSummary> => {
      if (source === 'api') {
        if (!projectId) throw new Error('The project has not loaded yet')
        const summary = await dashboardApi.getProjectSummary(org, projectId)
        return {
          admins: {
            count: summary.admins.count,
            people: summary.admins.people.map((person) => toPerson(person)),
          },
          projectKeys: summary.projectKeys,
          variables: summary.variables,
          shared: summary.shared,
        }
      }
      const [members, setup, variables, shared] = await Promise.all([
        mockServer.members.listProjectMembers(ctx, org, project),
        mockServer.setup.getProjectSetup(ctx, org, project),
        mockServer.variables.listProjectVariables(ctx, org, project),
        mockServer.items.listProjectShared(ctx, org, project),
      ])
      const own = variables.filter((v) => v.setAt.level === 'project').length
      return {
        admins: {
          count: projectAdmins(members).length,
          people: projectAdmins(members).slice(0, 5),
        },
        projectKeys: setup.projectKeys,
        variables: {
          total: variables.length,
          own,
          inherited: variables.length - own,
          first: variables.slice(0, 2).map((v) => v.name),
        },
        shared: {
          count: shared.length,
          first: shared.slice(0, 2).map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            from: item.from,
          })),
        },
      }
    },
    enabled: source !== 'api' || projectId !== null,
  })
}

/** Creates the project with its Default workspace; resolves to both, so the page can open it. */
export function useCreateProject(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const projects = useProjectsQuery(org)
  return useMutation({
    meta: { toast: { success: 'Project created', error: 'Couldn’t create the project' } },
    mutationFn: async (
      input: NewProjectInput,
    ): Promise<{ project: Project; workspace: Workspace }> => {
      if (source !== 'api') return mockServer.projects.createProject(ctx, org, input)
      const name = input.name.trim()
      const base = slugify(name) || 'project'
      // The slug steps past the org's existing ones, as the dummy server does: the list
      // the org home already holds, else one read.
      const taken = new Set((await client.ensureQueryData(projects)).map((p) => p.slug))
      const created = await dashboardApi.createProject(org, {
        name,
        slug: availableSlug('project', base, (slug) => taken.has(slug)),
        description: input.description?.trim() || undefined,
      })
      const { defaultWorkspace, ...row } = created
      return {
        project: projectFromRow(row, [
          {
            id: defaultWorkspace.id,
            slug: defaultWorkspace.slug,
            name: defaultWorkspace.name,
            colour: defaultWorkspace.colour,
          },
        ]),
        workspace: workspaceFromRow(defaultWorkspace),
      }
    },
    onSuccess: () => invalidateAll(client, projectKeys(org)),
  })
}

export function useUpdateProject(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const projectId = useProjectId(org, project)
  return useMutation({
    meta: { toast: { success: 'Project saved', error: 'Couldn’t save the project' } },
    mutationFn: async (update: ProjectUpdate): Promise<Project> => {
      if (source !== 'api') return mockServer.projects.updateProject(ctx, org, project, update)
      if (!projectId) throw new Error('The project has not loaded yet')
      const row = await dashboardApi.updateProject(org, projectId, {
        name: update.name,
        slug: update.slug,
        description: update.description ?? undefined,
      })
      return projectFromRow(row)
    },
    onSuccess: (updated) =>
      invalidateAll(
        client,
        [...projectKeys(org), ...throughProject(org, project)],
        updated.slug === project ? undefined : { org, project },
      ),
  })
}

export function useDeleteProject(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const projectId = useProjectId(org, project)
  return useMutation({
    meta: { toast: { success: 'Project deleted', error: 'Couldn’t delete the project' } },
    mutationFn: async (): Promise<void> => {
      if (source !== 'api') return mockServer.projects.deleteProject(ctx, org, project)
      if (!projectId) throw new Error('The project has not loaded yet')
      await dashboardApi.deleteProject(org, projectId)
    },
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

/** Moves the project to another org (one the viewer runs too); resolves to its new slugs, for the page to follow. */
export function useMoveProject(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const projectId = useProjectId(org, project)
  const orgs = useOrgs()
  return useMutation({
    meta: { toast: { success: 'Project moved', error: 'Couldn’t move the project' } },
    mutationFn: async (toOrg: string): Promise<{ org: string; project: string }> => {
      if (source !== 'api') return mockServer.projects.moveProject(ctx, org, project, toOrg)
      const target = orgs.data?.find((o) => o.slug === toOrg)
      if (!projectId || !target) throw new Error('The organization has not loaded yet')
      await dashboardApi.moveProject(projectId, target.id)
      return { org: toOrg, project }
    },
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
