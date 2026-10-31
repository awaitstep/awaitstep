import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { ACCESS_REASONS, grantCounts, inheritedWorkspaceRole } from '@awaitstep/ir'
import type { GrantRows } from '@awaitstep/db'
import { zValidator } from '../lib/validation.js'
import { parseOrgRole } from '../lib/org-role.js'
import { orgMemberRecord, personAccessRecord, projectMembersRecord } from '../lib/access-records.js'
import { rolesOf, workspacePersonRecord } from '../lib/scope-records.js'
import { recordAudit } from '../lib/audit.js'
import type { AppEnv } from '../types.js'

const projectRoleSchema = z.enum(['admin', 'member'])
const workspaceRoleSchema = z.enum(['admin', 'editor', 'viewer'])

const accessGrantSchema = z.object({
  orgRole: z.enum(['owner', 'admin', 'member']),
  projects: z.array(z.object({ projectId: z.string().min(1), role: projectRoleSchema })).max(200),
  workspaces: z
    .array(z.object({ workspaceId: z.string().min(1), role: workspaceRoleSchema }))
    .max(500),
})

const OWNERS_ONLY = 'Only owners can make or change owners'
const KEEP_AN_OWNER = 'Make someone else an owner first'

/**
 * Who can work where, below the organization. Session-only (the router):
 * every answer here names people. `GET /members?org=` lists the org's
 * members; with `&project=` it lists a project's.
 */
export const members = new Hono<AppEnv>()

members.get('/', async (c) => {
  const db = c.get('db')
  const userId = c.get('userId')
  const projectId = c.get('projectId') as string | undefined
  if (projectId) {
    const rows = await db.listProjectMembers(projectId, userId)
    return c.json(projectMembersRecord(rows))
  }
  const rows = await db.listOrgMembers(c.get('organizationId'), userId)
  return c.json({ data: rows.map(orgMemberRecord) })
})

members.get('/:userId/access', async (c) => {
  const rows = await c.get('db').getPersonAccess(c.get('organizationId'), c.req.param('userId'))
  if (!rows) return c.json({ error: 'Not found' }, 404)
  return c.json(personAccessRecord(rows))
})

/**
 * Save access: the person's org role and every project and workspace row
 * of theirs in the organization, replaced by the editor's — one read of
 * what the write needs to check, then one unit. Owners alone make or
 * change owners, and the organization always keeps one.
 */
members.put('/:userId/access', zValidator('json', accessGrantSchema), async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.req.param('userId')
  const grant = c.req.valid('json')

  // Org-wide roles carry no rows; the editor sends none for them either. A
  // project or workspace named twice counts once, its last role winning.
  const rows =
    grant.orgRole === 'member'
      ? {
          orgRole: grant.orgRole,
          projects: [...new Map(grant.projects.map((p) => [p.projectId, p])).values()],
          workspaces: [...new Map(grant.workspaces.map((w) => [w.workspaceId, w])).values()],
        }
      : { orgRole: grant.orgRole, projects: [], workspaces: [] }
  const projectIds = rows.projects.map((p) => p.projectId)
  const workspaceIds = rows.workspaces.map((w) => w.workspaceId)

  const check = await db.checkInOrganization(organizationId, { userId, projectIds, workspaceIds })
  if (check.role === null) return c.json({ error: 'Not found' }, 404)
  const isOwner = parseOrgRole(check.role) === 'owner'
  const callerIsOwner = c.get('orgRole') === 'owner'
  if ((isOwner || grant.orgRole === 'owner') && !callerIsOwner) {
    return c.json({ error: OWNERS_ONLY }, 403)
  }
  if (check.projects !== projectIds.length || check.workspaces !== workspaceIds.length) {
    return c.json({ error: 'Not found' }, 404)
  }

  await db.saveAccess(organizationId, userId, rows, c.get('userId'), { callerIsOwner })
  // The refusals the unit makes — the only owner stepping down, or an admin
  // meeting someone made owner meanwhile — are read back only when they could
  // have happened.
  if (!callerIsOwner || (isOwner && grant.orgRole !== 'owner')) {
    const after = await db.getOrgRole(organizationId, userId)
    if (after !== null && parseOrgRole(after) !== grant.orgRole) {
      return parseOrgRole(after) === 'owner' && !callerIsOwner
        ? c.json({ error: OWNERS_ONLY }, 403)
        : c.json({ error: KEEP_AN_OWNER }, 409)
    }
  }
  await recordAudit(c, {
    event: 'member.access',
    facts: {
      name: check.name ?? userId,
      fromRole: parseOrgRole(check.role),
      role: grant.orgRole,
      summary: placesSummary(rows.projects.length, rows.workspaces.length),
    },
  })
  return c.json({ ok: true })
})

function placesSummary(projects: number, workspaces: number): string | undefined {
  const parts = [
    projects > 0 ? `${projects} project${projects === 1 ? '' : 's'}` : null,
    workspaces > 0 ? `${workspaces} workspace${workspaces === 1 ? '' : 's'}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(', ') : undefined
}

/** Remove from the organization, with every row of theirs in it, as one unit. */
members.delete('/:userId', async (c) => {
  const db = c.get('db')
  const organizationId = c.get('organizationId')
  const userId = c.req.param('userId')

  const current = await db.checkInOrganization(organizationId, { userId })
  if (current.role === null) return c.json({ error: 'Not found' }, 404)
  const isOwner = parseOrgRole(current.role) === 'owner'
  const callerIsOwner = c.get('orgRole') === 'owner'
  if (isOwner && !callerIsOwner) return c.json({ error: OWNERS_ONLY }, 403)
  // The unit refuses the only owner, or an owner met by an admin, in its
  // WHERE; which one is read back only when it did not remove them.
  if (!(await db.removeOrgMember(organizationId, userId, { callerIsOwner }))) {
    const after = await db.getOrgRole(organizationId, userId)
    if (after === null) return c.json({ error: 'Not found' }, 404)
    return parseOrgRole(after) === 'owner' && !callerIsOwner
      ? c.json({ error: OWNERS_ONLY }, 403)
      : c.json({ error: KEEP_AN_OWNER }, 409)
  }
  await recordAudit(c, { event: 'member.remove', facts: { name: current.name ?? userId } })
  return c.json({ ok: true })
})

/** Where a workspace grant event is recorded: the workspace, by the name the scope read found. */
function workspaceAudit(c: Context<AppEnv>) {
  return {
    projectId: c.get('projectId'),
    workspaceId: c.get('workspaceId')!,
    name: c.get('workspaceName') ?? c.get('workspaceId')!,
  }
}

/** A workspace's own grants, under `/workspaces/:id/members` (the router's requireWorkspace). */
export const workspaceMembers = new Hono<AppEnv>()

workspaceMembers.get('/', async (c) => {
  const rows = await c.get('db').listWorkspacePeople(c.get('workspaceId')!)
  return c.json({ data: rows.map(workspacePersonRecord) })
})

/** Why a grant was refused, from the rows: not in the org, already in, or not above the project's. */
function refusal(rows: GrantRows | null, role: 'admin' | 'editor' | 'viewer', orgName: string) {
  if (!rows || rows.orgRole === null) return `They need to join ${orgName} first`
  const roles = rolesOf(rows)
  if (!grantCounts(role, roles.inheritedWorkspaceRole)) {
    return `They already have ${roles.inheritedWorkspaceRole} access through the project`
  }
  return rows.workspaceGrant ? 'Already in this workspace' : ACCESS_REASONS.workspaceAdmins
}

workspaceMembers.post(
  '/',
  zValidator('json', z.object({ userId: z.string().min(1), role: workspaceRoleSchema })),
  async (c) => {
    const db = c.get('db')
    const workspaceId = c.get('workspaceId')!
    const { userId, role } = c.req.valid('json')
    const added = await db.addWorkspaceMember({
      workspaceId,
      userId,
      role,
      createdBy: c.get('userId'),
    })
    if (added) {
      const { personName, ...member } = added
      const { name, ...at } = workspaceAudit(c)
      await recordAudit(c, {
        event: 'workspace_member.add',
        facts: { name, person: personName ?? userId, role },
        ...at,
      })
      return c.json(member, 201)
    }
    // The statement refused; one read says why.
    const rows = await db.getGrantRows(workspaceId, userId)
    return c.json({ error: refusal(rows, role, 'the organization') }, 409)
  },
)

workspaceMembers.patch(
  '/:userId',
  zValidator('json', z.object({ role: workspaceRoleSchema })),
  async (c) => {
    const db = c.get('db')
    const workspaceId = c.get('workspaceId')!
    const userId = c.req.param('userId')
    const { role } = c.req.valid('json')
    const updated = await db.setWorkspaceGrant(workspaceId, userId, role)
    if (updated) {
      const { personName, changed, ...member } = updated
      if (changed) {
        const { name, ...at } = workspaceAudit(c)
        await recordAudit(c, {
          event: 'workspace_member.role',
          facts: { name, person: personName ?? userId, role },
          ...at,
        })
      }
      return c.json(member)
    }
    const rows = await db.getGrantRows(workspaceId, userId)
    if (!rows?.workspaceGrant) return c.json({ error: 'Not found' }, 404)
    const inherited = inheritedWorkspaceRole(rolesOf(rows).projectRole)
    return c.json({ error: `They already have ${inherited} access through the project` }, 409)
  },
)

workspaceMembers.delete('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const removed = await c.get('db').removeWorkspaceGrant(c.get('workspaceId')!, userId)
  if (!removed) return c.json({ error: 'Not found' }, 404)
  const { name, ...at } = workspaceAudit(c)
  await recordAudit(c, {
    event: 'workspace_member.remove',
    facts: { name, person: removed.personName ?? userId, fromRole: removed.role },
    ...at,
  })
  return c.json({ ok: true })
})
