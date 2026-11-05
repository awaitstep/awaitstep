import { describe, it, expect } from 'vitest'
import {
  buildWorkflowStoreState,
  nodeToSelectOnce,
  panelToOpenOnce,
  deriveReadOnlyState,
  deriveDeploymentState,
} from '../hydrate-workflow'
import type { WorkflowSummary, WorkflowVersion, WorkflowFull, VersionSummary } from '../api-client'

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
    metadata: { name: 'WF', version: 1, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    entryNodeId: 'n1',
    nodes: [
      {
        id: 'n1',
        type: 'step',
        name: 'Step 1',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { code: 'return 1;' },
      },
      {
        id: 'n2',
        type: 'step',
        name: 'Step 2',
        version: '1.0.0',
        provider: 'cloudflare',
        data: { code: 'return 2;' },
      },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  }),
  locked: 0,
  createdAt: '2025-01-01',
}

describe('nodeToSelectOnce', () => {
  it('selects the URL’s node the first time', () => {
    expect(nodeToSelectOnce('n1', undefined)).toBe('n1')
  })

  it('does not select it again after a refetch re-hydrates the graph', () => {
    expect(nodeToSelectOnce('n1', 'n1')).toBeUndefined()
  })

  it('selects a different node when the URL names another', () => {
    expect(nodeToSelectOnce('n2', 'n1')).toBe('n2')
  })

  it('selects nothing without a node in the URL', () => {
    expect(nodeToSelectOnce(undefined, undefined)).toBeUndefined()
  })
})

describe('panelToOpenOnce', () => {
  it('opens the URL’s panel on the first hydration that sees it', () => {
    expect(panelToOpenOnce('settings', undefined)).toBe('settings')
  })

  it('does not open it again on the hydrations a save causes', () => {
    expect(panelToOpenOnce('settings', 'settings')).toBeUndefined()
  })

  it('opens nothing when the URL names no panel', () => {
    expect(panelToOpenOnce(undefined, undefined)).toBeUndefined()
    expect(panelToOpenOnce(undefined, 'settings')).toBeUndefined()
  })
})

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

  it('reads a workflow with no description (null from the API) as none, so a save can send it back', () => {
    const state = buildWorkflowStoreState({ ...baseWorkflow, description: null }, null, 0, false)
    const metadata = state.metadata as { description?: string | null }
    expect(metadata.description).toBeUndefined()
    // JSON drops undefined: the save's PATCH leaves the description alone instead of sending null.
    expect(JSON.stringify({ description: metadata.description })).toBe('{}')
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

  it('ignores trigger code an older IR still carries once the project is on handler modules', () => {
    const version = {
      id: 'v1',
      workflowId: 'wf1',
      version: 1,
      ir: JSON.stringify({
        nodes: [],
        edges: [],
        runtime: { triggerCode: '@fetch function old() {}' },
      }),
      locked: 0,
      createdAt: '',
    }
    expect(
      buildWorkflowStoreState({ ...baseWorkflow, triggerCode: null }, version, 1, false)
        .triggerCode,
    ).toBe('@fetch function old() {}')
    expect(
      buildWorkflowStoreState({ ...baseWorkflow, triggerCode: null }, version, 1, false, {
        handlerModules: true,
      }).triggerCode,
    ).toBe('')
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

  it('opens with the named node selected, flagged on the flow node too', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
      selectNodeId: 'n2',
    })
    expect(result.selectedNodeId).toBe('n2')
    expect(result.selectedEdgeId).toBeNull()
    const nodes = result.nodes as { id: string; selected?: boolean }[]
    expect(nodes.find((n) => n.id === 'n2')?.selected).toBe(true)
    expect(nodes.find((n) => n.id === 'n1')?.selected).toBeUndefined()
  })

  it('ignores a node id the version does not have, such as a step deleted since', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
      selectNodeId: 'deleted-node',
    })
    expect('selectedNodeId' in result).toBe(false)
    expect((result.nodes as { selected?: boolean }[]).some((n) => n.selected)).toBe(false)
  })

  it('puts the ring back on the selected node when the graph is rebuilt, e.g. after a save', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
      keepSelectedNodeId: 'n2',
    })
    expect(result.selectedNodeId).toBe('n2')
    const nodes = result.nodes as { id: string; selected?: boolean }[]
    expect(nodes.find((n) => n.id === 'n2')?.selected).toBe(true)
    expect(nodes.find((n) => n.id === 'n1')?.selected).toBeUndefined()
  })

  it('drops a selection the rebuilt graph no longer has', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
      keepSelectedNodeId: 'gone',
    })
    expect(result.selectedNodeId).toBeNull()
    expect((result.nodes as { selected?: boolean }[]).some((n) => n.selected)).toBe(false)
  })

  it('prefers the URL’s node, and keeps the selection when that node is missing', () => {
    expect(
      buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
        selectNodeId: 'n1',
        keepSelectedNodeId: 'n2',
      }).selectedNodeId,
    ).toBe('n1')
    expect(
      buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false, {
        selectNodeId: 'deleted',
        keepSelectedNodeId: 'n2',
      }).selectedNodeId,
    ).toBe('n2')
  })

  it('selects nothing when no node was asked for', () => {
    expect('selectedNodeId' in buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false)).toBe(
      false,
    )
  })

  it('parses IR nodes and edges from version data', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false)
    const nodes = result.nodes as {
      id: string
      type: string
      position: { x: number; y: number }
      data: { irNode: { id: string } }
    }[]
    expect(nodes).toHaveLength(2)
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
        metadata: { name: 'WF', version: 1, createdAt: '2025-01-01', updatedAt: '2025-01-01' },
        entryNodeId: 'n1',
        nodes: [
          {
            id: 'n1',
            type: 'resend_send_email',
            name: 'Send Email',
            position: { x: 0, y: 0 },
            version: '1.0.0',
            provider: 'cloudflare',
            data: {},
          },
        ],
        edges: [],
      }),
    }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    const nodes = result.nodes as { type: string }[]
    expect(nodes[0].type).toBe('custom')
  })

  it('assigns a deterministic fallback position to position-less nodes', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false)
    const nodes = result.nodes as { id: string; position: { x: number; y: number } }[]
    // n2 has no stored position (code-derived shape) and falls back to the grid
    expect(nodes[1].position).toEqual({ x: 320, y: 80 })
  })

  it('hydrates schema-invalid legacy rows through the lenient fallback', () => {
    // Rows saved before the versions route validated IR can miss required
    // fields (here: metadata/entryNodeId, node name) yet must still load.
    const version = {
      ...baseVersion,
      ir: JSON.stringify({
        nodes: [{ id: 'n1', type: 'step', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      }),
    }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    const nodes = result.nodes as { id: string }[]
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('n1')
  })

  it('fills triggerCode and dependencies from ir.runtime when columns are empty', () => {
    const ir = JSON.parse(baseVersion.ir)
    ir.runtime = { triggerCode: 'from-runtime', dependencies: { zod: '^4.0.0' } }
    const version = { ...baseVersion, ir: JSON.stringify(ir) }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    expect(result.triggerCode).toBe('from-runtime')
    expect(result.dependencies).toEqual({ zod: '^4.0.0' })
  })

  it('columns win over runtime while dual-write is active', () => {
    const ir = JSON.parse(baseVersion.ir)
    ir.runtime = { triggerCode: 'stale-runtime' }
    const version = { ...baseVersion, ir: JSON.stringify(ir) }
    const wf = { ...baseWorkflow, triggerCode: 'fresh-column' }
    const result = buildWorkflowStoreState(wf, version, 1, false)
    expect(result.triggerCode).toBe('fresh-column')
  })

  it('surfaces runtime.env declarations as blank-valued env vars (import round-trip)', () => {
    const ir = JSON.parse(baseVersion.ir)
    ir.runtime = { env: [{ name: 'API_KEY', secret: true }, { name: 'REGION' }] }
    const version = { ...baseVersion, ir: JSON.stringify(ir) }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    expect(result.workflowEnvVars).toEqual([
      { name: 'SECRET_API_KEY', value: '' },
      { name: 'REGION', value: '' },
    ])
  })

  it('column env vars win over runtime declarations', () => {
    const ir = JSON.parse(baseVersion.ir)
    ir.runtime = { env: [{ name: 'FROM_RUNTIME' }] }
    const version = { ...baseVersion, ir: JSON.stringify(ir) }
    const wf = { ...baseWorkflow, envVars: JSON.stringify([{ name: 'FROM_COLUMN', value: 'x' }]) }
    const result = buildWorkflowStoreState(wf, version, 1, false)
    expect(result.workflowEnvVars).toEqual([{ name: 'FROM_COLUMN', value: 'x' }])
  })

  it('resets runtimeBindings on every hydrate — no leak across workflows', () => {
    const result = buildWorkflowStoreState(baseWorkflow, baseVersion, 1, false)
    expect(result.runtimeBindings).toEqual([])
  })

  it('loads binding declarations into runtimeBindings', () => {
    const ir = JSON.parse(baseVersion.ir)
    ir.runtime = { bindings: [{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }] }
    const version = { ...baseVersion, ir: JSON.stringify(ir) }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    expect(result.runtimeBindings).toEqual([{ name: 'KV_CACHE', type: 'kv', resourceId: 'abc' }])
  })

  it('ignores IR that is not even array-shaped', () => {
    const version = { ...baseVersion, ir: JSON.stringify({ nodes: 'nope' }) }
    const result = buildWorkflowStoreState(baseWorkflow, version, 1, false)
    expect(result.nodes).toBeUndefined()
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

describe('deriveReadOnlyState with a version the list does not hold', () => {
  it('is still read-only, with no number to show, for a version beyond the loaded ones', () => {
    // GET /workflows/:id/full lists only the newest 100 versions.
    const loaded = [{ id: 'v105', version: 105 }] as unknown as VersionSummary[]
    expect(deriveReadOnlyState('v5', 'v105', loaded)).toEqual({
      isReadOnly: true,
      readOnlyVersion: undefined,
    })
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
      handlers: { modules: false, consumedQueues: [] },
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
      handlers: { modules: false, consumedQueues: [] },
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
      handlers: { modules: false, consumedQueues: [] },
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
