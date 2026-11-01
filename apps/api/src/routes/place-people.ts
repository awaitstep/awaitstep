import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { inheritedWorkspaceRole } from '@awaitstep/ir'
import { isUniqueViolation } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { parseOrgRole } from '../lib/org-role.js'
import { recordAudit } from '../lib/audit.js'
import { inviteEmailsSchema, sendInvitations, type Place } from '../lib/send-invitations.js'
import type { AppEnv } from '../types.js'

// Adding people from a project or a workspace (21a, 21b): people already in
// the organization get grants here, and an email becomes an invitation to
// join the organization as a Member with this place. Who may do it is the
// router's: project admins (`requireProjectCan('manageMembers')`) and
// workspace admins (`requireWorkspaceCan('manageMembers')`), never wider
// than the place they manage.

const workspaceRoleSchema = z.enum(['admin', 'editor', 'viewer'])

/** What the people get in the project: one project-wide role, or one role in some of its workspaces. */
const projectAccessSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('project'), role: z.enum(['admin', 'member']) }),
  z.object({
    scope: z.literal('workspaces'),
    workspaceIds: z.array(z.string().min(1)).min(1).max(50),
    role: workspaceRoleSchema,
  }),
])

type ProjectAccess = z.infer<typeof projectAccessSchema>

const JOIN_FIRST = 'They need to join the organization first'

/** Org owners and admins already see every invitation; anyone else sending one doesn't. */
function isOrgAdmin(c: Context<AppEnv>): boolean {
  const role = c.get('orgRole')
  return role === 'owner' || role === 'admin'
}

function placesFor(projectId: string, access: ProjectAccess): Place[] {
  if (access.scope === 'project') return [{ projectId, workspaceId: null, role: access.role }]
  return [...new Set(access.workspaceIds)].map((workspaceId) => ({
    projectId,
    workspaceId,
    role: access.role,
  }))
}

/** Why a project add wrote nothing: one read of the person's rows and of the workspaces named. */
async function projectRefusal(c: Context<AppEnv>, userId: string, access: ProjectAccess) {
  const workspaceIds = access.scope === 'workspaces' ? [...new Set(access.workspaceIds)] : []
  const rows = await c.get('db').projectGrantRows(c.get('projectId')!, userId, workspaceIds)
  if (!rows) return c.json({ error: 'Not found' }, 404)
  // A workspace that isn't this project's, as the invite route answers it.
  if (rows.workspacesInProject !== workspaceIds.length) return c.json({ error: 'Not found' }, 404)
  const orgRole = rows.orgRole === null ? null : parseOrgRole(rows.orgRole)
  if (orgRole === null) return c.json({ error: JOIN_FIRST }, 409)
  if (orgRole === 'owner' || orgRole === 'admin') {
    return c.json({ error: `They’re an org ${orgRole}, so they already reach every project` }, 409)
  }
  if (access.scope === 'project') {
    if (rows.projectGrant) return c.json({ error: 'Already in this project' }, 409)
    if (rows.workspaceGrants) {
      return c.json(
        {
          error:
            'They already work in some of its workspaces: change their access from Edit access',
        },
        409,
      )
    }
    return c.json({ error: JOIN_FIRST }, 409)
  }
  if (rows.projectGrant === 'admin' || rows.projectGrant === 'member') {
    const inherited = inheritedWorkspaceRole(rows.projectGrant)
    return c.json({ error: `They already have ${inherited} access through the project` }, 409)
  }
  return c.json({ error: 'They already have access to those workspaces' }, 409)
}

/**
 * The same add sent twice at once (two tabs) passes both statements' checks
 * and loses on the key: answered like any other refusal, not as a 500.
 */
async function unlessDuplicate<T>(write: Promise<T>, none: T): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error)) return none
    throw error
  }
}

/** `/projects/:id/members` and `/projects/:id/invitations` (the router's requireProjectParam). */
export const projectPeople = new Hono<AppEnv>()

/**
 * Adds someone already in the organization to the project: a project-wide
 * role, or one role in the workspaces picked. One statement; when it writes
 * nothing, one read says why.
 */
projectPeople.post(
  '/members',
  zValidator('json', z.object({ userId: z.string().min(1), access: projectAccessSchema })),
  async (c) => {
    const db = c.get('db')
    const projectId = c.get('projectId')!
    const { userId, access } = c.req.valid('json')
    const createdBy = c.get('userId')
    const projectName = c.get('projectName') ?? projectId

    if (access.scope === 'project') {
      const added = await unlessDuplicate(
        db.addProjectMember({ projectId, userId, role: access.role, createdBy }),
        null,
      )
      if (!added) return projectRefusal(c, userId, access)
      await recordAudit(c, {
        event: 'project_member.add',
        facts: { name: projectName, person: added.personName ?? userId, role: access.role },
        projectId,
      })
      return c.json({ userId, scope: 'project', role: access.role }, 201)
    }

    const added = await unlessDuplicate(
      db.addWorkspaceGrants({
        projectId,
        workspaceIds: [...new Set(access.workspaceIds)],
        userId,
        role: access.role,
        createdBy,
      }),
      [],
    )
    if (added.length === 0) return projectRefusal(c, userId, access)
    await recordAudit(
      c,
      ...added.map((grant) => ({
        event: 'workspace_member.add' as const,
        facts: { name: grant.workspaceName, person: grant.personName ?? userId, role: access.role },
        projectId,
        workspaceId: grant.workspaceId,
      })),
    )
    return c.json(
      {
        userId,
        scope: 'workspaces',
        role: access.role,
        workspaces: added.map((grant) => ({ id: grant.workspaceId, name: grant.workspaceName })),
      },
      201,
    )
  },
)

/** Invites people new to the organization as Members, with access to this project only. */
projectPeople.post(
  '/invitations',
  zValidator('json', z.object({ emails: inviteEmailsSchema, access: projectAccessSchema })),
  (c) => {
    const projectId = c.get('projectId')!
    const { emails, access } = c.req.valid('json')
    return sendInvitations(c, {
      emails,
      role: 'member',
      places: placesFor(projectId, access),
      inProject: projectId,
      hidePending: !isOrgAdmin(c),
      at: { projectId, workspaceId: null },
    })
  },
)

/** `/workspaces/:id/invitations` (the router's requireWorkspace). */
export const workspaceInvitations = new Hono<AppEnv>()

/** Invites people new to the organization as Members, with a role in this workspace only. */
workspaceInvitations.post(
  '/',
  zValidator('json', z.object({ emails: inviteEmailsSchema, role: workspaceRoleSchema })),
  (c) => {
    const projectId = c.get('projectId')!
    const { emails, role } = c.req.valid('json')
    return sendInvitations(c, {
      emails,
      role: 'member',
      places: [{ projectId, workspaceId: c.get('workspaceId')!, role }],
      inProject: projectId,
      hidePending: !isOrgAdmin(c),
      at: { projectId, workspaceId: c.get('workspaceId')! },
    })
  },
)
