import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { validateIR, workflowIRSchema } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

const createVersionSchema = z.object({
  ir: workflowIRSchema,
})

const lockVersionSchema = z.object({
  locked: z.boolean(),
})

export const versions = new Hono<AppEnv>()

versions.get('/:workflowId/versions', async (c) => {
  const db = c.get('db')
  const list = await db.listVersionsByWorkflow(c.req.param('workflowId'))
  return c.json(list)
})

versions.get('/:workflowId/versions/:versionId', async (c) => {
  const db = c.get('db')
  const version = await db.getWorkflowVersionById(c.req.param('versionId'))
  if (!version || version.workflowId !== c.req.param('workflowId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(version)
})

versions.post('/:workflowId/versions', zValidator('json', createVersionSchema), async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const body = c.req.valid('json')

  const validation = validateIR(body.ir)
  if (!validation.ok) {
    return c.json({ error: 'Invalid IR', details: validation.errors }, 400)
  }

  const irString = JSON.stringify(body.ir)

  const existing = await db.listVersionsByWorkflow(workflowId)
  const latest = existing[0] // ordered by descending version number

  // Check if the latest version has been deployed
  const workflow = await db.getWorkflowById(workflowId)
  if (!workflow) return c.json({ error: 'Workflow not found' }, 404)

  const activeDeployment = await db.getActiveDeployment(workflowId)

  if (latest) {
    // If latest version has NOT been deployed, overwrite it in place
    if (latest.id !== activeDeployment?.versionId) {
      // Check if IR actually changed
      if (latest.ir === irString) {
        return c.json(latest, 200)
      }
      await db.updateVersion(latest.id, { ir: irString })
      const updated = await db.getWorkflowVersionById(latest.id)
      return c.json(updated, 200)
    }

    // If latest version HAS been deployed and IR hasn't changed, return it
    if (latest.ir === irString) {
      return c.json(latest, 200)
    }
  }

  // Create new version: either first version, or IR changed from a deployed version
  const nextVersion = await db.getNextVersionNumber(workflowId)

  const version = await db.createVersion({
    id: nanoid(),
    workflowId,
    version: nextVersion,
    ir: irString,
  })

  await db.updateWorkflow(workflowId, { currentVersionId: version.id })

  return c.json(version, 201)
})

versions.patch(
  '/:workflowId/versions/:versionId',
  zValidator('json', lockVersionSchema),
  async (c) => {
    const db = c.get('db')
    const workflowId = c.req.param('workflowId')
    const versionId = c.req.param('versionId')
    const { locked } = c.req.valid('json')

    const version = await db.getWorkflowVersionById(versionId)
    if (!version || version.workflowId !== workflowId) {
      return c.json({ error: 'Not found' }, 404)
    }

    await db.updateVersion(versionId, { locked: locked ? 1 : 0 })
    const updated = await db.getWorkflowVersionById(versionId)
    return c.json(updated)
  },
)

versions.post('/:workflowId/versions/:versionId/revert', async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const versionId = c.req.param('versionId')

  const targetVersion = await db.getWorkflowVersionById(versionId)
  if (!targetVersion || targetVersion.workflowId !== workflowId) {
    return c.json({ error: 'Not found' }, 404)
  }

  const nextVersion = await db.getNextVersionNumber(workflowId)

  const newVersion = await db.createVersion({
    id: nanoid(),
    workflowId,
    version: nextVersion,
    ir: targetVersion.ir,
  })

  await db.updateWorkflow(workflowId, { currentVersionId: newVersion.id })

  return c.json(newVersion, 201)
})

versions.delete('/:workflowId/versions/:versionId', async (c) => {
  const db = c.get('db')
  const workflowId = c.req.param('workflowId')
  const versionId = c.req.param('versionId')

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflowId) {
    return c.json({ error: 'Not found' }, 404)
  }

  if (version.locked === 1) {
    return c.json({ error: 'Version is locked — unlock it before deleting' }, 400)
  }

  const workflow = await db.getWorkflowById(workflowId)
  if (workflow?.currentVersionId === versionId) {
    return c.json({ error: 'Cannot delete the active version' }, 400)
  }

  // Also block if this version is the currently deployed one
  const activeDeployment = await db.getActiveDeployment(workflowId)
  if (activeDeployment?.versionId === versionId) {
    return c.json({ error: 'Cannot delete a deployed version' }, 400)
  }

  await db.deleteVersion(versionId)
  return c.json({ ok: true })
})
