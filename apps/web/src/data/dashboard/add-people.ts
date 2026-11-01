import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defineToast, failureLine } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import { plural } from '../../lib/plural'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  AddPeopleInput,
  AddPeopleOutcome,
  ProjectAccessChoice,
} from '../../types/dashboard/access'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { dashKeys, invalidateAll } from './keys'
import { useProjectId } from './projects'
import { useMockContext } from './scenario-context'
import { useDataSource } from './source'
import { useWorkspaceId } from './workspaces'

// Add people (21a from a project, 21b from a workspace): each picked org
// member is its own request, so one refusal (already in, outside the org)
// leaves the rest added; the new addresses go as one invite request.

const GENERAL = 'Couldn’t add them'

/**
 * Runs every add and the one invite request, and says how each pick went.
 * `add` resolves to the workspace names granted when it can say (21a's
 * workspaces scope), so the done list shows what was written, not what was asked.
 */
export async function addEach(
  input: AddPeopleInput,
  add: (userId: string) => Promise<string[] | void>,
  invite: (emails: string[]) => Promise<unknown>,
): Promise<AddPeopleOutcome[]> {
  const settled = await Promise.allSettled([
    ...input.userIds.map((userId) => add(userId)),
    ...(input.emails.length > 0 ? [invite(input.emails)] : []),
  ])
  const added = input.userIds.map((key, i): AddPeopleOutcome => {
    const result = settled[i]!
    if (result.status === 'rejected') {
      return { key, result: 'failed', error: failureLine(result.reason, GENERAL) }
    }
    const workspaces = result.value as string[] | void
    return workspaces ? { key, result: 'added', workspaces } : { key, result: 'added' }
  })
  const sent = settled[input.userIds.length]
  const invited = input.emails.map((key): AddPeopleOutcome =>
    sent?.status === 'fulfilled'
      ? { key, result: 'invited' }
      : { key, result: 'failed', error: failureLine(sent?.reason, GENERAL) },
  )
  const outcomes = [...added, ...invited]
  // Nothing went through: the action failed, with the first refusal's reason.
  const failures = outcomes.filter((o) => o.result === 'failed')
  if (failures.length === outcomes.length) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')
    throw first?.reason ?? new Error(GENERAL)
  }
  return outcomes
}

/** "Added 2 people", "Invite sent", "Added 1 person and sent 1 invite · 1 not added". */
export function addPeopleSummary(outcomes: AddPeopleOutcome[]): string {
  const added = outcomes.filter((o) => o.result === 'added').length
  const invited = outcomes.filter((o) => o.result === 'invited').length
  const failed = outcomes.filter((o) => o.result === 'failed').length
  const invites = invited === 1 ? 'invite' : 'invites'
  let line: string
  if (added > 0 && invited > 0) {
    line = `Added ${plural(added, 'person', 'people')} and sent ${invited} ${invites}`
  } else if (added > 0) line = `Added ${plural(added, 'person', 'people')}`
  else line = invited === 1 ? 'Invite sent' : `${invited} invites sent`
  return failed > 0 ? `${line} · ${failed} not added` : line
}

const addToast = defineToast<unknown, AddPeopleOutcome[]>({
  success: (_v, outcomes) => addPeopleSummary(outcomes),
  error: GENERAL,
})

/** Adding people changes who can open the project's workspaces, its Members page and the invites. */
function peopleKeys(org: string, project: string) {
  return [
    dashKeys.inProject('workspaces', org, project),
    dashKeys.inProject('members', org, project),
    dashKeys.invitations(org),
    // Org Members lists each person's places, and the access editor reads them too.
    dashKeys.orgMembers(org),
    dashKeys.projects(org),
    dashKeys.scope(),
  ]
}

/** 21b: picked org members get `role` in the workspace; new addresses are invited with it. */
export function useAddWorkspacePeople(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: addToast },
    mutationFn: ({ role, ...input }: AddPeopleInput & { role: WorkspaceRole }) => {
      if (source !== 'api') {
        return addEach(
          input,
          async (userId) => {
            await mockServer.members.addWorkspaceMember(ctx, slugs, userId, role)
          },
          async (emails) => mockServer.members.inviteToWorkspace(ctx, slugs, emails, role),
        )
      }
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      return addEach(
        input,
        async (userId) => {
          await dashboardApi.addWorkspaceMember(workspaceId, { userId, role })
        },
        (emails) => dashboardApi.inviteToWorkspace(workspaceId, { emails, role }),
      )
    },
    onSuccess: () => invalidateAll(client, peopleKeys(slugs.org, slugs.project)),
  })
}

/** 21a: picked org members get `access` in the project; new addresses are invited with it. */
export function useAddProjectPeople(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const projectId = useProjectId(org, project)
  return useMutation({
    meta: { toast: addToast },
    mutationFn: ({ access, ...input }: AddPeopleInput & { access: ProjectAccessChoice }) => {
      if (source !== 'api') {
        return addEach(
          input,
          async (userId) => mockServer.members.addToProject(ctx, org, project, userId, access),
          async (emails) => mockServer.members.inviteToProject(ctx, org, project, emails, access),
        )
      }
      if (!projectId) throw new Error('The project has not loaded yet')
      return addEach(
        input,
        (userId) =>
          dashboardApi
            .addToProject(projectId, { userId, access })
            .then((res) => res.workspaces?.map((w) => w.name)),
        (emails) => dashboardApi.inviteToProject(projectId, { emails, access }),
      )
    },
    onSuccess: () => invalidateAll(client, peopleKeys(org, project)),
  })
}
