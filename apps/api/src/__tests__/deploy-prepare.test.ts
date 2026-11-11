import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GeneratedBundle, ProviderConfig } from '@awaitstep/codegen'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import { isDeployError, prepareDeploy } from '../lib/deploy-prepare.js'
import { resetStore, TEST_ORG_ID, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

/**
 * Every generate that reaches the real adapter, with the config it was given.
 * The adapter itself is real — the bundle under assertion is the one codegen
 * actually produces.
 */
const generated: { config: ProviderConfig | undefined; bundle: GeneratedBundle }[] = []

vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'generate') {
            return (ir: Parameters<typeof adapter.generate>[0], config?: ProviderConfig) => {
              const bundle = adapter.generate(ir, config)
              generated.push({ config, bundle })
              return bundle
            }
          }
          // Credentials are not what this file is about, and verifying them
          // would reach the Cloudflare API.
          if (property === 'verifyCredentials') {
            return () => Promise.resolve({ valid: true })
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const validIR = {
  metadata: {
    name: 'test',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

async function seed() {
  await mockDb.createWorkflow({
    id: 'wf-1',
    projectId: TEST_PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Test',
  })
  const version = await mockDb.createVersion({
    id: 'v-1',
    workflowId: 'wf-1',
    ir: JSON.stringify(validIR),
  })
  await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
  await mockDb.createConnection({
    id: 'conn-1',
    organizationId: TEST_ORG_ID,
    createdBy: TEST_USER_ID,
    provider: 'cloudflare',
    name: 'CF',
    credentials: JSON.stringify({ accountId: 'acct', apiToken: 'token' }),
  })
  return version
}

describe('prepareDeploy', () => {
  beforeEach(async () => {
    resetStore()
    generated.length = 0
    await seed()
  })

  it('generates the bundle once, and ships the bundle it generated', async () => {
    // Two passes meant the code the compile gate checked was not the code
    // that was uploaded: the second pass was the only one holding the
    // deployment config.
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    expect(isDeployError(prepared)).toBe(false)
    if (isDeployError(prepared)) return

    expect(generated).toHaveLength(1)
    expect(prepared.bundle).toBe(generated[0]!.bundle)
  })

  it('carries a v2 workflow cron into the deployment config', async () => {
    const legacy = {
      ...validIR,
      trigger: { type: 'cron', expression: '0 * * * *' },
      runtime: {
        files: [
          {
            path: 'handlers/scheduled.ts',
            source: 'export default async function handler() { return undefined }\n',
          },
        ],
      },
    }
    const v2 = await mockDb.createVersion({
      id: 'v-2',
      workflowId: 'wf-1',
      ir: JSON.stringify(legacy),
    })
    await mockDb.updateWorkflow('wf-1', { currentVersionId: v2.id })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    expect(isDeployError(prepared)).toBe(false)
    if (isDeployError(prepared)) return
    expect(prepared.resolvedDeploymentConfig).toMatchObject({
      cronTriggers: ['0 * * * *'],
    })
  })

  it('bakes the resolved deployment config into that one bundle', async () => {
    // Retention is the part of the deployment config that generation reads —
    // it becomes a const in the entry, so the bundle either carries the
    // configured value or it was generated without the config.
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      deploymentConfig: { retention: { successRetention: '1 day', errorRetention: '2 days' } },
    })
    expect(isDeployError(prepared)).toBe(false)
    if (isDeployError(prepared)) return

    expect(generated).toHaveLength(1)
    const workflowModule = prepared.bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!
    expect(workflowModule.source).toContain('export const AWAITSTEP_RETENTION')
    expect(workflowModule.source).toContain('1 day')
    expect(workflowModule.source).toContain('2 days')
    // And the config travelled with the generate, not only with the deploy.
    const options = generated[0]!.config?.options as { deploymentConfig?: unknown }
    expect(options.deploymentConfig).toMatchObject({
      retention: { successRetention: '1 day' },
    })
  })

  it('defaults the retention when no config is stored', async () => {
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    if (isDeployError(prepared)) throw new Error(prepared.error)
    const workflowModule = prepared.bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!
    expect(workflowModule.source).toContain('7 days')
  })

  it('deploys a workflow with no workers.dev URL when no config is stored (D-9)', async () => {
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    if (isDeployError(prepared)) throw new Error(prepared.error)
    expect(prepared.resolvedDeploymentConfig).toMatchObject({
      workersDev: false,
      previewUrls: false,
    })
  })

  it('keeps workers.dev off for a deploy whose config leaves it out', async () => {
    // An API deploy may send only what it changes; the rest is the kind's defaults.
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      deploymentConfig: { compatibilityDate: '2026-11-01' },
    })
    if (isDeployError(prepared)) throw new Error(prepared.error)
    expect(prepared.resolvedDeploymentConfig).toMatchObject({
      compatibilityDate: '2026-11-01',
      workersDev: false,
      previewUrls: false,
    })
  })

  it('fills a stored config that predates a setting from the defaults', async () => {
    await mockDb.upsertDeploymentConfig({
      id: 'dc-1',
      workflowId: 'wf-1',
      connectionId: 'conn-1',
      provider: 'cloudflare',
      config: JSON.stringify({ compatibilityDate: '2026-01-01' }),
    })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    if (isDeployError(prepared)) throw new Error(prepared.error)
    expect(prepared.resolvedDeploymentConfig).toMatchObject({
      compatibilityDate: '2026-01-01',
      workersDev: false,
    })
  })

  it('keeps workers.dev on when the deploy asks for it', async () => {
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      deploymentConfig: { workersDev: true },
    })
    if (isDeployError(prepared)) throw new Error(prepared.error)
    expect(prepared.resolvedDeploymentConfig).toMatchObject({ workersDev: true })
  })

  it('reads the version row once when a version is named', async () => {
    const versions = vi.spyOn(mockDb, 'getWorkflowVersionById')
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      versionId: 'v-1',
    })
    expect(isDeployError(prepared)).toBe(false)
    // The lock check and the prepare are two questions about one row.
    expect(versions).toHaveBeenCalledTimes(1)
    versions.mockRestore()
  })

  it('refuses a locked version before generating anything', async () => {
    await mockDb.updateVersion('v-1', { locked: 1 })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      versionId: 'v-1',
    })
    expect(isDeployError(prepared) && prepared.status).toBe(400)
    expect(generated).toHaveLength(0)
  })

  it('refuses replacing a locked version only on the account that runs it', async () => {
    await mockDb.createVersion({ id: 'v-2', workflowId: 'wf-1', ir: JSON.stringify(validIR) })
    await mockDb.createDeployment({
      id: 'dep-locked',
      workflowId: 'wf-1',
      versionId: 'v-1',
      versionNumber: 1,
      connectionId: 'conn-2',
      serviceName: 'svc',
      status: 'success',
    })
    await mockDb.updateVersion('v-1', { locked: 1 })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepare = (connectionId: string) =>
      prepareDeploy({
        db: mockDb,
        workflow,
        organizationId: TEST_ORG_ID,
        projectId: TEST_PROJECT_ID,
        connectionId,
        versionId: 'v-2',
      })
    const refused = await prepare('conn-2')
    expect(isDeployError(refused) && [refused.status, refused.error]).toEqual([
      400,
      'The version deployed on this account is locked — unlock it before deploying',
    ])
    // conn-1 runs nothing locked: v-2 goes out there.
    expect(isDeployError(await prepare('conn-1'))).toBe(false)
  })

  it('says another workflow’s version is not found, before anything about its lock', async () => {
    await mockDb.createWorkflow({
      id: 'wf-2',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Other',
    })
    await mockDb.createVersion({ id: 'v-other', workflowId: 'wf-2', ir: JSON.stringify(validIR) })
    await mockDb.updateVersion('v-other', { locked: 1 })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!
    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
      versionId: 'v-other',
    })
    expect(isDeployError(prepared) && [prepared.status, prepared.error]).toEqual([
      404,
      'Version not found',
    ])
    expect(generated).toHaveLength(0)
  })

  it('refuses a workflow that needs another provider, before generating', async () => {
    const providerIR = {
      ...validIR,
      nodes: [
        {
          ...validIR.nodes[0]!,
          data: { code: "import { inngest } from '#awaitstep/inngest'\nreturn 1;" },
        },
      ],
    }
    const version = await mockDb.createVersion({
      id: 'v-inngest',
      workflowId: 'wf-1',
      ir: JSON.stringify(providerIR),
    })
    await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
    const workflow = (await mockDb.getWorkflowById('wf-1'))!

    const prepared = await prepareDeploy({
      db: mockDb,
      workflow,
      organizationId: TEST_ORG_ID,
      projectId: TEST_PROJECT_ID,
      connectionId: 'conn-1',
    })
    expect(isDeployError(prepared)).toBe(true)
    if (!isDeployError(prepared)) return
    expect(prepared.status).toBe(400)
    expect(prepared.error).toContain('Cannot deploy to cloudflare')
    expect(prepared.error).toContain('#awaitstep/inngest')
    // The artifact was never built: the constraint is known before generation.
    expect(generated).toHaveLength(0)
  })
})
