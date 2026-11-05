import type { ReactNode } from 'react'
import type { StepManifest } from '@awaitstep/codegen'
import type { WorkflowNode } from '@awaitstep/ir'
import type { VersionSummary } from '../../../../lib/api-client'
import { useWorkflowStore } from '../../../../stores/workflow-store'
import { StepSyncProvider } from '../../step-sync-context'

export function irNode(
  id: string,
  name: string,
  type = 'step',
  data: Record<string, unknown> = {},
): WorkflowNode {
  return { id, type, name, version: '1.0.0', provider: 'cloudflare', data }
}

/**
 * A workflow the Steps view and the inspector can be exercised against:
 *
 *   validate → charge → check (branch) → ship   (arm "paid")
 *                                      → wait   (arm "late", a sleep, no file)
 */
export const NODES: WorkflowNode[] = [
  irNode('validate', 'Validate order'),
  irNode('charge', 'Charge card', 'step', {
    retryLimit: 3,
    retryDelay: '10 seconds',
    backoff: 'exponential',
  }),
  irNode('check', 'Paid?', 'branch'),
  irNode('ship', 'Ship order'),
  irNode('wait', 'Wait 2 days', 'sleep'),
]

export const EDGES = [
  { id: 'e1', source: 'validate', target: 'charge' },
  { id: 'e2', source: 'charge', target: 'check' },
  { id: 'e3', source: 'check', target: 'ship', label: 'paid' },
  { id: 'e4', source: 'check', target: 'wait', label: 'late' },
]

export const MANIFEST: StepManifest = {
  irHash: 'h',
  steps: [
    { nodeId: 'validate', varName: 'validate_order', filePath: 'nodes/validate_order.ts' },
    { nodeId: 'charge', varName: 'charge_card', filePath: 'nodes/charge_card.ts' },
    { nodeId: 'ship', varName: 'ship_order', filePath: 'nodes/ship_order.ts' },
    { nodeId: 'wait', varName: 'wait_2_days' },
  ],
}

export const FILES = new Map([
  ['nodes/validate_order.ts', { source: "import { c } from '#app/lib/payments/charge'" }],
  ['nodes/charge_card.ts', { source: "import { c } from '#app/lib/payments/charge'" }],
  ['nodes/ship_order.ts', { source: '' }],
  ['lib/payments/charge.ts', { source: '' }],
  ['package.json', { source: '{}' }],
])

export const PROJECT_PATHS = new Set(['lib/payments/charge.ts'])

export const VERSIONS: VersionSummary[] = [
  { id: 'v-11', version: 11, locked: 0, createdAt: '2026-11-01' },
  { id: 'v-12', version: 12, locked: 0, createdAt: '2026-11-02' },
]

export function loadGraph(nodes = NODES, edges = EDGES): void {
  useWorkflowStore.setState({
    nodes: nodes.map((irNode, i) => ({
      id: irNode.id,
      type: irNode.type,
      position: { x: 0, y: i * 80 },
      data: { irNode },
    })),
    edges,
  } as never)
}

export function SyncHarness({
  children,
  manifest = MANIFEST,
  kind = 'workflow',
  files = FILES,
  codeVersionId = 'v-12' as string | null,
  workflowFile = 'awaitstep/workflow.ts',
  graphVersionId = 'v-12',
}: {
  children: ReactNode
  manifest?: StepManifest | null
  kind?: 'workflow' | 'script'
  files?: ReadonlyMap<string, { source: string }>
  codeVersionId?: string | null
  workflowFile?: string | null
  /** Null: the workflow has never been saved on the canvas. */
  graphVersionId?: string | null
}) {
  return (
    <StepSyncProvider
      workflowId="wf_1"
      linkVersion={undefined}
      kind={kind}
      manifest={manifest}
      files={files}
      projectPaths={PROJECT_PATHS}
      workflowFile={workflowFile}
      versions={VERSIONS}
      graphVersionId={graphVersionId}
      codeVersionId={codeVersionId}
    >
      {children}
    </StepSyncProvider>
  )
}
