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
    try {
      const ir = JSON.parse(versionData.ir) as {
        nodes?: WorkflowNode[]
        edges?: { id: string; source: string; target: string; label?: string }[]
      }
      if (ir.nodes && ir.edges) {
        state.nodes = ir.nodes.map((irNode: WorkflowNode) => ({
          id: irNode.id,
          type: toFlowType(irNode.type),
          position: irNode.position,
          data: { irNode },
        }))
        state.edges = ir.edges
      }
    } catch {
      /* ignore malformed IR */
    }
  }

  return state
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
