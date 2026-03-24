import { describe, it, expect } from 'vitest'
import {
  buildWorkflowStoreState,
  deriveReadOnlyState,
  deriveDeploymentState,
} from '../hydrate-workflow'
import type { WorkflowSummary, WorkflowVersion, WorkflowFull } from '../api-client'

const baseWorkflow: WorkflowSummary = {
  id: 'wf1',
  name: 'Test Workflow',
  description: 'A test',
  envVars: null,
  triggerCode: null,
  dependencies: null,
  currentVersionId: 'v1',
  createdAt: '2025-01-01',
  updatedAt: '2025-01-02',
}

const baseVersion: WorkflowVersion = {
  id: 'v1',
  workflowId: 'wf1',
  version: 1,
  ir: JSON.stringify({
    nodes: [
      {
        id: 'n1',
        type: 'step',
        position: { x: 0, y: 0 },
        config: { name: 'Step 1' },
      },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  }),
  generatedCode: '',
  locked: 0,
  createdAt: '2025-01-01',
}

describe('buildWorkflowStoreState', () => {
  it('maps server workflow fields to metadata', () => {
    const result = buildWorkflowStoreState(baseWorkflow, null, 3, false)
    expect(result.metadata).toEqual({
      name: 'Test Workflow',
      description: 'A test',
      version: 3,
      createdAt: '2025-01-01',
      updatedAt: '2025-01-02',
    })
  })

  it('always sets isDirty to false', () => {
    const result = buildWorkflowStoreState(baseWorkflow, null, 1, false)
    expect(result.isDirty).toBe(false)
  })

  it('sets readOnly from parameter', () => {
    expect(buildWorkflowStoreState(baseWorkflow, null, 1, true).readOnly).toBe(true)
    expect(buildWorkflowStoreState(baseWorkflow, null, 1, false).readOnly).toBe(false)
  })

  it('parses valid envVars JSON', () => {
    const wf = { ...baseWorkflow, envVars: JSON.stringify([{ name: 'KEY', value: 'val' }]) }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.workflowEnvVars).toEqual([{ name: 'KEY', value: 'val' }])
  })

  it('handles malformed envVars gracefully', () => {
    const wf = { ...baseWorkflow, envVars: '{broken' }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.workflowEnvVars).toEqual([])
  })

  it('handles non-array envVars gracefully', () => {
    const wf = { ...baseWorkflow, envVars: JSON.stringify({ not: 'array' }) }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.workflowEnvVars).toEqual([])
  })

  it('extracts triggerCode when present', () => {
    const wf = { ...baseWorkflow, triggerCode: 'return { params }' }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.triggerCode).toBe('return { params }')
  })

  it('defaults triggerCode to empty string when absent', () => {
    const result = buildWorkflowStoreState(baseWorkflow, null, 1, false)
    expect(result.triggerCode).toBe('')
  })

  it('parses valid dependencies JSON', () => {
    const wf = { ...baseWorkflow, dependencies: JSON.stringify({ lodash: '4.0.0' }) }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.dependencies).toEqual({ lodash: '4.0.0' })
  })

  it('handles malformed dependencies gracefully', () => {
    const wf = { ...baseWorkflow, dependencies: 'not json' }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.dependencies).toEqual({})
  })

  it('rejects array dependencies', () => {
    const wf = { ...baseWorkflow, dependencies: JSON.stringify(['not', 'object']) }
    const result = buildWorkflowStoreState(wf, null, 1, false)
    expect(result.dependencies).toEqual({})
  })

  it('parses IR nodes and edges from version data', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false)
    const nodes = result.nodes as { id: string; type: string; data: { irNode: { id: string } } }[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n1')
    expect(nodes[0].type).toBe('step')
    expect(nodes[0].data.irNode.id).toBe('n1')

    const edges = result.edges as { id: string; source: string; target: string }[]
    expect(edges).toHaveLength(1)
    expect(edges[0]).toEqual({ id: 'e1', source: 'n1', target: 'n2' })
  })

  it('maps custom node types to "custom" flow type', () => {
    const version = {
      ...baseVersion,
      ir: JSON.stringify({
        nodes: [{ id: 'n1', type: 'resend_send_email', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      }),
    }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    const nodes = result.nodes as { type: string }[]
    expect(nodes[0].type).toBe('custom')
  })

  it('handles malformed IR gracefully', () => {
    const version = { ...baseVersion, ir: 'not json' }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    expect(result.nodes).toBeUndefined()
    expect(result.edges).toBeUndefined()
  })

  it('handles null version data', () => {
    const result = buildWorkflowStoreState(baseWorkflow, null, 1, false)
    expect(result.nodes).toBeUndefined()
  })
})

describe('deriveReadOnlyState', () => {
  const versions = [
    { id: 'v2', version: 2, locked: 0, createdAt: '' },
    { id: 'v1', version: 1, locked: 0, createdAt: '' },
  ]

  it('returns isReadOnly true when versionParam differs from currentVersionId', () => {
    const result = deriveReadOnlyState('v1', 'v2', versions)
    expect(result.isReadOnly).toBe(true)
    expect(result.readOnlyVersion).toBe(1)
  })

  it('returns isReadOnly false when no versionParam', () => {
    const result = deriveReadOnlyState(undefined, 'v2', versions)
    expect(result.isReadOnly).toBe(false)
    expect(result.readOnlyVersion).toBeUndefined()
  })

  it('returns isReadOnly false when versionParam matches currentVersionId', () => {
    const result = deriveReadOnlyState('v2', 'v2', versions)
    expect(result.isReadOnly).toBe(false)
  })

  it('returns isReadOnly false when no currentVersionId', () => {
    const result = deriveReadOnlyState('v1', null, versions)
    expect(result.isReadOnly).toBe(false)
  })
})

describe('deriveDeploymentState', () => {
  it('computes hasActiveDeployment correctly', () => {
    const fullData: WorkflowFull = {
      workflow: baseWorkflow,
      version: null,
      versions: [],
      activeDeployment: {
        id: 'd1',
        workflowId: 'wf1',
        versionId: 'v1',
        connectionId: null,
        serviceName: 'svc',
        serviceUrl: null,
        status: 'success',
        error: null,
        createdAt: '',
      },
    }
    const result = deriveDeploymentState(fullData)
    expect(result.hasActiveDeployment).toBe(true)
  })

  it('returns hasActiveDeployment false when no deployment', () => {
    const fullData: WorkflowFull = {
      workflow: baseWorkflow,
      version: null,
      versions: [],
      activeDeployment: null,
    }
    const result = deriveDeploymentState(fullData)
    expect(result.hasActiveDeployment).toBe(false)
  })

  it('computes hasUndeployedChanges when versions differ', () => {
    const fullData: WorkflowFull = {
      workflow: { ...baseWorkflow, currentVersionId: 'v2' },
      version: null,
      versions: [{ id: 'v2', version: 2, locked: 0, createdAt: '' }],
      activeDeployment: {
        id: 'd1',
        workflowId: 'wf1',
        versionId: 'v1',
        connectionId: null,
        serviceName: 'svc',
        serviceUrl: null,
        status: 'success',
        error: null,
        createdAt: '',
      },
    }
    const result = deriveDeploymentState(fullData)
    expect(result.hasUndeployedChanges).toBeTruthy()
  })

  it('handles undefined fullData', () => {
    const result = deriveDeploymentState(undefined)
    expect(result.hasActiveDeployment).toBe(false)
    expect(result.currentVersion).toBe(0)
  })
})
