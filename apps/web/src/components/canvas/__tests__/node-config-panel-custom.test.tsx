import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NodeDefinition } from '@awaitstep/ir'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { NodeConfigPanel } from '../node-config-panel'

// A Library node's panel by what the registry knows: placed and published,
// missing once the list is known, and not yet known (loading or failed).
const registry = vi.hoisted(() => ({
  definition: undefined as NodeDefinition | undefined,
  status: 'ready' as 'loading' | 'ready' | 'error',
}))

vi.mock('../../../contexts/node-registry-context', () => ({
  useNodeRegistry: () => ({
    registry: {
      get: (type: string) => (type === 'custom:lead' ? registry.definition : undefined),
      getAll: () => [],
    },
    customNodes: new Map(
      registry.definition
        ? [['custom:lead', { itemId: 'lead', owner: 'workspace', version: '1.0.1' }]]
        : [],
    ),
    customNodesStatus: registry.status,
    refresh: () => {},
  }),
}))

const LEAD: NodeDefinition = {
  id: 'custom:lead',
  name: 'Lead router',
  version: '1.0.1',
  description: 'Routes leads',
  category: 'CRM',
  author: 'custom',
  license: 'UNLICENSED',
  providers: ['cloudflare'],
  configSchema: { threshold: { type: 'number', label: 'Hot threshold' } },
  outputSchema: {},
} as unknown as NodeDefinition

const NODE = {
  id: 'route_1',
  type: 'custom:lead',
  name: 'Route lead',
  position: { x: 0, y: 0 },
  version: '1.0.1',
  provider: 'cloudflare',
  data: {},
}

function renderPanel() {
  useWorkflowStore.setState({
    kind: 'workflow',
    selectedNodeId: NODE.id,
    nodes: [{ id: NODE.id, type: NODE.type, position: NODE.position, data: { irNode: NODE } }],
    edges: [],
  } as never)
  render(
    <EditorScopeProvider value={{ org: 'acme', project: 'project-101', workspace: 'sales' }}>
      <NodeConfigPanel />
    </EditorScopeProvider>,
  )
}

const UNAVAILABLE = 'This custom node isn’t published, or isn’t in this workspace.'

beforeEach(() => {
  useWorkflowStore.getState().reset()
  registry.definition = undefined
  registry.status = 'ready'
})

describe('NodeConfigPanel for a Library node', () => {
  it('shows its version, an Open in Library link and its fields', () => {
    registry.definition = LEAD
    renderPanel()
    expect(screen.getByText('v1.0.1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Scripts & nodes' })).toHaveAttribute(
      'href',
      '/acme/project-101/sales/scripts-nodes/code?item=lead',
    )
    expect(screen.queryByText(UNAVAILABLE)).toBeNull()
  })

  it('says it is unavailable once the list is known, without the unknown-type error', () => {
    renderPanel()
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument()
    expect(screen.queryByText(/Unknown node type/)).toBeNull()
    expect(screen.queryByText('custom:lead')).toBeNull()
  })

  it('claims nothing while the list loads', () => {
    registry.status = 'loading'
    renderPanel()
    expect(screen.queryByText(UNAVAILABLE)).toBeNull()
    expect(screen.queryByText(/Couldn’t load/)).toBeNull()
  })

  it('says the list failed to load rather than that the node is unavailable', () => {
    registry.status = 'error'
    renderPanel()
    expect(screen.getByText(/Couldn’t load your custom nodes/)).toBeInTheDocument()
    expect(screen.queryByText(UNAVAILABLE)).toBeNull()
  })
})
