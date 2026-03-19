import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { zValidator } from '../lib/validation.js'
import { validateIR, workflowIRSchema } from '@awaitstep/ir'
import { generateWorkflow } from '@awaitstep/provider-cloudflare'
import type { WorkflowIR } from '@awaitstep/ir'
import type { AppEnv } from '../types.js'

const createVersionSchema = z.object({
  ir: workflowIRSchema,
})

export const versions = new Hono<AppEnv>()

versions.get('/:workflowId/versions', async (c) => {
  const db = c.get('db')
  const list = await db.listVersionsByWorkflow(c.req.param('workflowId'))
  return c.json(list)
})

versions.get('/:workflowId/versions/:versionId', async (c) => {
  const db = c.get('db')
  const version = await db.getVersionById(c.req.param('versionId'))
  if (!version || version.workflowId !== c.req.param('workflowId')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(version)
})

versions.post(
  '/:workflowId/versions',
  zValidator('json', createVersionSchema),
  async (c) => {
    const db = c.get('db')
    const workflowId = c.req.param('workflowId')
    const body = c.req.valid('json')

    const validation = validateIR(body.ir)
    if (!validation.ok) {
      return c.json({ error: 'Invalid IR', details: validation.errors }, 400)
    }

    const irString = JSON.stringify(body.ir)
    const templateResolver = c.get('nodeRegistry')?.templateResolver
    const generatedCode = generateWorkflow(body.ir as WorkflowIR, templateResolver)

    const existing = await db.listVersionsByWorkflow(workflowId)
    const latest = existing[0] // ordered by descending version number

    // Check if the latest version has been deployed
    const workflow = await db.getWorkflowById(workflowId)
    if (!workflow) return c.json({ error: 'Workflow not found' }, 404)

    const deployments = await db.listDeploymentsByWorkflow(workflowId)
    const latestDeployedVersionId = deployments.find((d) => d.status === 'success')?.versionId

    if (latest) {
      // If latest version has NOT been deployed, overwrite it in place
      if (latest.id !== latestDeployedVersionId) {
        // Check if IR actually changed
        if (latest.ir === irString) {
          return c.json(latest, 200)
        }
        await db.updateVersion(latest.id, { ir: irString, generatedCode })
        const updated = await db.getVersionById(latest.id)
        return c.json(updated, 200)
      }

      // If latest version HAS been deployed and IR hasn't changed, return it
      if (latest.ir === irString) {
        return c.json(latest, 200)
      }
    }

    // Create new version: either first version, or IR changed from a deployed version
    const nextVersion = existing.length > 0
      ? Math.max(...existing.map((v) => v.version)) + 1
      : 1

    const version = await db.createVersion({
      id: nanoid(),
      workflowId,
      version: nextVersion,
      ir: irString,
      generatedCode,
    })

    await db.updateWorkflow(workflowId, { currentVersionId: version.id })

    return c.json(version, 201)
  },
)
