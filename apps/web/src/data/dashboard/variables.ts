import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type {
  OrgVariable,
  ResolvedVariable,
  VariableInput,
  VariableScope,
  WorkspaceVariable,
} from '../../types/dashboard/variables'
import { allPages } from './api/pages'
import {
  blankValueError,
  savedLine,
  toOrgVariable,
  toResolvedVariable,
  toUpdateBody,
  toWorkspaceVariable,
  variableSlugs,
} from './api/variables'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** Resources → Variables: what the org sets for every project. */
export function useOrgVariables(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgVariables(org)),
    queryFn: (): Promise<OrgVariable[]> =>
      source === 'api'
        ? allPages((cursor) => dashboardApi.listOrgVariables(org, cursor)).then((res) =>
            res.data.map(toOrgVariable),
          )
        : mockServer.variables.listOrgVariables(ctx, org),
  })
}

/** Project settings → Variables: each name once, as the project resolves it. */
export function useProjectVariables(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.projectVariables(org, project)),
    queryFn: (): Promise<ResolvedVariable[]> =>
      source === 'api'
        ? dashboardApi
            .listResolvedProjectVariables({ org, project })
            .then((res) => res.data.map(toResolvedVariable))
        : mockServer.variables.listProjectVariables(ctx, org, project),
  })
}

/** Workspace settings → Variables: each name once, the closest level winning. */
export function useWorkspaceVariables(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.workspaceVariables(slugs)),
    queryFn: (): Promise<WorkspaceVariable[]> =>
      source === 'api'
        ? dashboardApi
            .listResolvedWorkspaceVariables(slugs)
            .then((res) => res.data.map(toWorkspaceVariable))
        : mockServer.variables.listWorkspaceVariables(ctx, slugs),
  })
}

/** What a variable change shows up in: every Variables list and the setup counts. */
function variableKeys(org: string) {
  return [dashKeys.inOrg('variables', org), dashKeys.inOrg('setup', org)]
}

/**
 * New variable, Edit, or Override. On the API an edit is addressed by the
 * row's id (the list carries it); a create at a level whose name is taken
 * answers 409, which the dialog puts on the name field.
 */
export function useSetVariable(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: {
        // Places that set their own value of the name are left out, and said so.
        success: (_input, data) =>
          savedLine((data as SavedVariable | undefined)?.skipped.length ?? 0),
        error: 'Couldn’t save the variable',
      },
    },
    mutationFn: async (input: VariableInput): Promise<SavedVariable> => {
      if (source !== 'api') {
        await mockServer.variables.setVariable(ctx, org, input)
        return { skipped: [] }
      }
      const slugs = variableSlugs(org, input.scope)
      const blank = blankValueError(input)
      if (blank) throw new ApiError(blank, 422, { field: 'value' })
      if (input.mode === 'edit') {
        if (!input.id) throw new ApiError('This variable is not listed here any more', 404)
        const updated = await dashboardApi.updateVariable(slugs, input.id, toUpdateBody(input))
        return { skipped: updated.skipped }
      }
      const created = await dashboardApi.createVariable(slugs, {
        name: input.name,
        value: input.value,
        isSecret: input.isSecret,
        ...(input.reach && { reach: input.reach }),
      })
      return { skipped: created.skipped }
    },
    onSuccess: () => invalidateAll(client, variableKeys(org)),
  })
}

/** What a save answers: the listed places it left out because they set their own value. */
interface SavedVariable {
  skipped: string[]
}

export function useDeleteVariable(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Variable deleted', error: 'Couldn’t delete the variable' } },
    mutationFn: async ({
      scope,
      name,
      id,
    }: {
      scope: VariableScope
      name: string
      id?: string
    }): Promise<void> => {
      if (source !== 'api') return mockServer.variables.deleteVariable(ctx, org, scope, name)
      if (!id) throw new ApiError('This variable is not listed here any more', 404)
      await dashboardApi.deleteVariable(variableSlugs(org, scope), id)
    },
    onSuccess: () => invalidateAll(client, variableKeys(org)),
  })
}
