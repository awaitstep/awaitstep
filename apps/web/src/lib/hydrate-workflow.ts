import { loadArtifact } from '@awaitstep/ir'
import type { WorkflowNode } from '@awaitstep/ir'
import type {
  WorkflowSummary,
  WorkflowVersion,
  WorkflowFull,
  VersionSummary,
  DeploymentSummary,
} from './api-client'
import { toFlowType } from '../stores/workflow-store'

export function buildWorkflowStoreState(
  serverWorkflow: WorkflowSummary,
  versionData: WorkflowVersion | null | undefined,
  currentVersion: number,
  isReadOnly: boolean,
) {
  const state: Record<string, unknown> = {
    kind: serverWorkflow.kind ?? 'workflow',
    workflowEnvVars: [],
    dependencies: {},
    triggerCode: '',
    deployConfig: {},
    validationResult: null,
    simulationResult: null,
    isDirty: false,
    readOnly: isReadOnly,
    metadata: {
      name: serverWorkflow.name,
      description: serverWorkflow.description,
      version: currentVersion,
      createdAt: serverWorkflow.createdAt,
      updatedAt: serverWorkflow.updatedAt,
    },
  }

  if (serverWorkflow.envVars) {
    try {
      const parsed = JSON.parse(serverWorkflow.envVars)
      if (Array.isArray(parsed)) {
        state.workflowEnvVars = parsed.map(
          (v: { name: string; value: string; isSecret?: boolean }) => ({
            name: v.isSecret ? `SECRET_${v.name}` : v.name,
            value: v.value,
          }),
        )
      }
    } catch {
      /* ignore malformed */
    }
  }

  if (serverWorkflow.triggerCode) {
    state.triggerCode = serverWorkflow.triggerCode
  }

  if (serverWorkflow.dependencies) {
    try {
      const parsed = JSON.parse(serverWorkflow.dependencies)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        state.dependencies = parsed
      }
    } catch {
      /* ignore malformed */
    }
  }

  if (serverWorkflow.deployConfig) {
    try {
      const parsed = JSON.parse(serverWorkflow.deployConfig)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        state.deployConfig = parsed
      }
    } catch {
      /* ignore malformed */
    }
  }

  if (versionData?.ir) {
    // Parse once; loadArtifact (lazy v1→v2 migration + schema check) runs on
    // the parsed object. Rows saved before the versions route validated IR can
    // be schema-invalid yet still canvas-editable, so on schema failure fall
    // back to the legacy lenient shape check — the canvas must never present
    // stored work as an empty graph.
    let raw: unknown
    try {
      raw = JSON.parse(versionData.ir)
    } catch {
      /* ignore malformed IR */
    }
    let irNodes: WorkflowNode[] | undefined
    let irEdges: unknown[] | undefined
    if (raw !== undefined) {
      const loaded = loadArtifact(raw)
      if (loaded.ok) {
        irNodes = loaded.value.nodes
        irEdges = loaded.value.edges
      } else {
        const legacy = raw as {
          nodes?: WorkflowNode[]
          edges?: { id: string; source: string; target: string; label?: string }[]
        }
        if (Array.isArray(legacy.nodes) && Array.isArray(legacy.edges)) {
          irNodes = legacy.nodes
          irEdges = legacy.edges
        }
      }
    }
    if (irNodes && irEdges) {
      state.nodes = irNodes.map((irNode: WorkflowNode, i: number) => ({
        id: irNode.id,
        type: toFlowType(irNode.type),
        position: irNode.position ?? fallbackPosition(i),
        data: { irNode },
      }))
      state.edges = irEdges
    }
  }

  return state
}

/**
 * Grid cascade for nodes without a stored position (code-derived workflows).
 * Deterministic so re-hydration is stable until a real auto-layout pass runs.
 * Shared by every irNode→FlowNode mapping site so previews and the editor
 * agree on where position-less nodes land.
 */
export function fallbackPosition(index: number): { x: number; y: number } {
  return { x: 80 + (index % 4) * 240, y: 80 + Math.floor(index / 4) * 160 }
}

export function deriveReadOnlyState(
  versionParam: string | undefined,
  currentVersionId: string | null | undefined,
  versions: VersionSummary[] | undefined,
): { isReadOnly: boolean; readOnlyVersion: number | undefined } {
  const isReadOnly = !!(versionParam && currentVersionId && versionParam !== currentVersionId)
  const readOnlyVersion = isReadOnly
    ? versions?.find((v) => v.id === versionParam)?.version
    : undefined
  return { isReadOnly, readOnlyVersion }
}

export function deriveDeploymentState(fullData: WorkflowFull | undefined) {
  const serverWorkflow = fullData?.workflow
  const activeDeployment: DeploymentSummary | null = fullData?.activeDeployment ?? null
  const versions = fullData?.versions
  const hasActiveDeployment = !!activeDeployment
  const currentVersion = versions?.[0]?.version ?? 0
  const deployedVersionId = activeDeployment?.versionId
  const deployedVersion = versions?.find((v) => v.id === deployedVersionId)

  return {
    serverWorkflow,
    activeDeployment,
    versions,
    hasActiveDeployment,
    currentVersion,
    deployedVersion,
    hasUndeployedChanges:
      hasActiveDeployment &&
      deployedVersionId &&
      deployedVersionId !== serverWorkflow?.currentVersionId,
  }
}
