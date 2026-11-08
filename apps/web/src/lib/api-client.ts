import type {
  ConnectionSummary as ApiConnectionSummary,
  DeployConnections,
  LiveDeployment,
} from '@awaitstep/ir'
import type { ProviderCapabilities, RuntimeRequirement, SourceDiagnostic } from '@awaitstep/codegen'
import type { ApiWorkflowPageSummary } from './dashboard-api'
import type {
  GeneratedFile,
  StepManifest,
  TestSessionResponse,
  TestSessionRuntime,
} from '@awaitstep/codegen'
import { useOrgStore } from '../stores/org-store'
import { pathSegment } from './api-path'

const API_BASE = '/api'

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor: string | null
}

export interface PaginationOptions {
  cursor?: string
  limit?: number
}

function withPagination(path: string, opts?: PaginationOptions): string {
  if (!opts) return path
  const params = new URLSearchParams()
  if (opts.cursor) params.set('cursor', opts.cursor)
  if (opts.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  if (!qs) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${qs}`
}

interface ErrorBody {
  message: string
  /**
   * The API answered JSON with a reason (`error`, `message` or `details`). An
   * HTML page from a proxy or a bare status has none: its text is never shown.
   */
  hasReason: boolean
  /**
   * The form field the error points at: a validation failure's first issue
   * path, or the `field` a route names itself ("token", "emails").
   */
  field?: string
}

/** The human-readable error an API response carries, or a plain status line when it has none. */
async function readErrorBody(res: Response): Promise<ErrorBody> {
  const bare = { message: `Request failed (${res.status})`, hasReason: false }
  const text = await res.text().catch(() => '')
  try {
    const json = JSON.parse(text) as {
      error?: string
      message?: string
      field?: string
      details?: { path?: string; message?: string }[]
    }
    const issue = json.details?.[0]
    const reason = issue?.message ?? json.error ?? json.message
    if (typeof reason !== 'string' || !reason.trim()) return bare
    return { message: reason, hasReason: true, field: issue?.path || json.field || undefined }
  } catch {
    return bare
  }
}

/** A non-2xx API response; `message` is the server's human-readable error. */
export class ApiError extends Error {
  /** The server's `X-Request-Id`, for "Error ID …" on error states. */
  readonly requestId: string | undefined
  /** The form field the error belongs to, when the server named one. */
  readonly field: string | undefined
  /** False when the response carried no reason (a proxy's page, an empty body): show a general line. */
  readonly hasReason: boolean

  constructor(
    message: string,
    readonly status: number,
    extra: { requestId?: string; field?: string; hasReason?: boolean } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.requestId = extra.requestId
    this.field = extra.field
    this.hasReason = extra.hasReason ?? true
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const { message, field, hasReason } = await readErrorBody(res)
    throw new ApiError(message, res.status, {
      requestId: res.headers.get('x-request-id') ?? undefined,
      field,
      hasReason,
    })
  }

  return res.json()
}

/** Which organization and project a client's calls name. */
export interface ApiScope {
  organizationId: string | null
  projectId: string | null
}

function withParam(path: string, name: string, value: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${name}=${encodeURIComponent(value)}`
}

/** The old shell's scope: the org/project switcher's choice. */
function storeScope(): ApiScope {
  const { activeOrganizationId, activeProjectId } = useOrgStore.getState()
  return { organizationId: activeOrganizationId, projectId: activeProjectId }
}

export interface DeployConfig {
  route?: {
    pattern: string
    zoneName: string
  }
}

export interface WorkflowSummary {
  id: string
  name: string
  /** Null when it has none: the API stores an empty description as null. */
  description?: string | null
  /**
   * `'workflow'` (default) or `'script'`. Scripts are fetch-only entries —
   * no durable runtime, no instance lifecycle, no Runs tab.
   */
  kind?: 'workflow' | 'script'
  envVars?: string | null
  triggerCode?: string | null
  dependencies?: string | null
  deployConfig?: string | null
  currentVersionId?: string | null
  deployStatus?: string | null
  deployVersionId?: string | null
  lastRunStatus?: string | null
  lastRunAt?: string | null
  /** The workspace it lives in; every workflow has one since workspaces (B1). */
  workspaceId?: string
  /** Set while it's shared to the project (who shared it). */
  sharedBy?: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowVersion {
  id: string
  workflowId: string
  version: number
  ir: string
  locked: number
  createdAt: string
  /** In a list: who saved it last; null before authors were kept (or once they're removed). */
  createdByName?: string | null
}

export interface VersionSummary {
  id: string
  version: number
  locked: number
  createdAt: string
  /** Who saved it last; null before authors were kept (or once they're removed). */
  createdByName?: string | null
}

export interface DeploymentSummary {
  id: string
  workflowId: string
  /** Null once that version is deleted; `version` still says which it was. */
  versionId: string | null
  connectionId: string | null
  serviceName: string
  serviceUrl: string | null
  /** 'success', 'failed' or 'taken_down' (kept as history once its account was taken down). */
  status: string
  error: string | null
  createdAt: string
  takenDownAt?: string | null
  /** Who deployed it; null before authors were kept (or once they're removed). */
  createdByName?: string | null
  /** In a list: its version's number (kept after the version is deleted) and lock (1 locked). */
  version?: number | null
  versionLocked?: number | null
  /** In a list: its account's name; null once the account is deleted. */
  connectionName?: string | null
}

/** The latest version's identity: what a save names as its base, and what the poll compares. */
export interface VersionRef {
  id: string
  graphHash: string
}

/** A version as a save returns it, with the precondition for the next save. */
export type SavedVersion = WorkflowVersion & { graphHash: string }

export interface WorkflowFull {
  workflow: WorkflowSummary
  version: WorkflowVersion | null
  /** The save precondition for `version` (`baseGraphHash`); null without a version. */
  graphHash: string | null
  versions: VersionSummary[]
  /** What is live on each account, newest first. */
  liveDeployments: LiveDeployment[]
  /** The project's handler modules, as far as the canvas needs to know. */
  handlers: {
    /** The project uses handler modules; `workflow.triggerCode` is then null. */
    modules: boolean
    /** Queues with a `handlers/queue/<name>.ts` consumer. */
    consumedQueues: string[]
  }
}

/**
 * A version's presentation source as `GET /workflows/:id/source` returns it:
 * the provider-neutral module, env, runtime, step and project files. Provider
 * entries and platform adapters are deploy artifacts and are not part of it.
 */
/**
 * Something wrong with the workflow that did not stop the source being
 * produced. Re-exported from codegen, which owns the shape — three copies
 * of it used to drift because the data arrives as JSON and nothing checks.
 */
export type { SourceDiagnostic }

/** A disposable worker running this workflow before it is deployed. */
export interface TestSession {
  id: string
  workflowId: string | null
  versionId: string | null
  runtime: TestSessionRuntime
  status: 'starting' | 'running' | 'stopped' | 'failed'
  error: string | null
  createdAt: string
  lastUsedAt: string
  /**
   * The project files the session was built from, `{ path: hash }`. Null for a
   * session started before manifests were stored: it cannot say what changed.
   */
  files: Record<string, string> | null
}

export interface StartTestSessionResponse {
  session: TestSession
  /** True when this is the session the user already had. */
  reused: boolean
}

/** The worker's own response, not the API's. */
export type TestSessionTriggerResponse = TestSessionResponse

export interface WorkflowSource {
  /** Null for a workflow with no saved version: only project files, nothing generated. */
  versionId: string | null
  /** Null when there is no version to generate an entry from. */
  entry: string | null
  /** The file to open first: a workflow's portable definition, else the entry. Null without a version. */
  primary?: string | null
  files: SourceFile[]
  manifest: StepManifest | null
  /** Provider-scoped primitives and bindings the workflow needs. */
  requirements?: RuntimeRequirement[]
  /** Empty when the workflow is healthy; never absent. */
  diagnostics: SourceDiagnostic[]
}

/**
 * A bundle file as `GET /source` returns it. Project-owned files carry the
 * content hash the file routes serve as ETag, taken from the same read as
 * the text, so an edit started from this response has a precondition that
 * matches what was actually read. Generated files have none.
 */
export interface SourceFile extends GeneratedFile {
  hash?: string
}

export interface ProjectFileSummary {
  path: string
  /** Content hash; the API serves it as the file's ETag. */
  hash: string
  size: number
  updatedAt: string
}

export interface ProjectFileContent extends ProjectFileSummary {
  source: string
}

/** `GET /project`: the stored files with their hashes and the latest version, no text. */
export interface ProjectListing {
  files: ProjectFileSummary[]
  version: VersionRef | null
}

/**
 * What the annotations declared that modules cannot carry — provider-shaped;
 * these are the provider credential keys the UI knows how to describe.
 */
export interface HandlerDeclarations {
  crons?: string[]
  queueConfigs?: { queue: string }[]
  [key: string]: unknown
}

/** Where the annotation file's handlers would land, and the settings only the deployment config can hold. */
export interface HandlerConversionPreview {
  /** Where the conversion reads from: the stored handlers.ts, the legacy setting, or the current version's IR. */
  source: 'file' | 'setting' | 'version'
  paths: string[]
  declarations: HandlerDeclarations
}

export interface HandlerConversionResult extends Omit<HandlerConversionPreview, 'paths'> {
  files: ProjectFileSummary[]
  /** The declarations were folded into the stored deployment configs. */
  deploymentConfigUpdated: boolean
}

/** The declarations a conversion leaves for the deployment config, worded for a notice; empty when none. */
export function describeHandlerDeclarations(declarations: HandlerDeclarations): string[] {
  const facts: string[] = []
  if (declarations.crons?.length) facts.push(`cron triggers ${declarations.crons.join(', ')}`)
  if (declarations.queueConfigs?.length) {
    facts.push(`queue settings for ${declarations.queueConfigs.map((q) => q.queue).join(', ')}`)
  }
  return facts
}

/**
 * What a write is conditional on: the hash the caller read (`If-Match`), or
 * that the path is still free (`If-None-Match: *`). Every write from the
 * workspace carries one, so nothing an agent wrote meanwhile is overwritten
 * without the user choosing to.
 */
export type WritePrecondition = { ifMatch: string } | { ifNoneMatch: true }

/**
 * A conditional write or delete the server refused: the file changed since
 * it was read, or already exists (`currentHash` is what is stored now).
 */
export class ProjectFileConflictError extends Error {
  /** A refusal: its message is the server's reason. */
  readonly status = 409

  constructor(
    message: string,
    readonly currentHash: string | null,
  ) {
    super(message)
    this.name = 'ProjectFileConflictError'
  }
}

/**
 * A save the server refused because the workflow's graph moved since it was
 * loaded (`baseGraphHash` is not the latest version's). Nothing was written;
 * `currentVersionId`/`currentGraphHash` are what is stored now (null while
 * the workflow has no version).
 */
export class VersionConflictError extends Error {
  /** A refusal: its message is the server's reason. */
  readonly status = 409

  constructor(
    message: string,
    readonly currentVersionId: string | null,
    readonly currentGraphHash: string | null,
  ) {
    super(message)
    this.name = 'VersionConflictError'
  }
}

async function versionRequest<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      currentVersionId?: string | null
      currentGraphHash?: string | null
    }
    throw new VersionConflictError(
      body.error ?? 'Conflict',
      body.currentVersionId ?? null,
      body.currentGraphHash ?? null,
    )
  }
  if (!res.ok) {
    const { message, field, hasReason } = await readErrorBody(res)
    throw new ApiError(message, res.status, {
      requestId: res.headers.get('x-request-id') ?? undefined,
      field,
      hasReason,
    })
  }
  return res.json()
}

function encodeProjectPath(path: string): string {
  return path.split('/').map(pathSegment).join('/')
}

async function projectFileRequest<T>(path: string, options: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
  })
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      currentHash?: string | null
    }
    throw new ProjectFileConflictError(body.error ?? 'Conflict', body.currentHash ?? null)
  }
  if (!res.ok) {
    const { message, hasReason } = await readErrorBody(res)
    throw new ApiError(message, res.status, { hasReason })
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export interface RunSummary {
  id: string
  workflowId: string
  /** Null once that version is deleted; `versionNumber` still says which it was. */
  versionId: string | null
  versionNumber: number | null
  connectionId: string | null
  instanceId: string
  status: string
  output: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export type RunStepKind = 'do' | 'sleep' | 'waitForEvent' | 'rollback'
export type RunStepStatus = 'running' | 'waiting' | 'complete' | 'errored'

/** One provider-reported durable step occurrence within a run (F8 telemetry). */
export interface RunStep {
  id: string
  runId: string
  /** Owning canvas node, when the deploy manifest could attribute the label. */
  nodeId: string | null
  stepName: string
  kind: RunStepKind
  /** 1-based occurrence per (label, kind) — loop iterations repeat a label. */
  stepIndex: number
  status: RunStepStatus
  attemptCount: number
  error: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RunStepsResponse {
  data: RunStep[]
  /** memberNodeId → leader nodeId for nodes whose code ran inside a merged step. */
  coalescedInto: Record<string, string>
}

/** A connection as `GET /connections` lists it: the account by suffix, never its credentials. */
export type ConnectionSummary = ApiConnectionSummary

export interface ApiKeySummary {
  id: string
  name: string
  /** Set on project-level keys; null on organization-level keys. */
  projectId: string | null
  /** Set on organization-level keys; null on project-level keys. */
  organizationId: string | null
  /** The project's name, joined in by the list endpoint; null on org keys. */
  projectName: string | null
  keyPrefix: string
  scopes: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface ApiKeyCreated extends ApiKeySummary {
  key: string
}

/**
 * The API calls, addressed to whatever `scope` names when each call is made.
 * A workflow's pages get one bound to the URL's project (`useApi`), so a call
 * made after you leave still goes to that project; everything else uses `api`.
 */
export function createApiClient(scope: () => ApiScope) {
  function withOrg(path: string): string {
    const { organizationId } = scope()
    if (!organizationId) throw new Error('No active organization selected')
    return withParam(path, 'organizationId', organizationId)
  }

  function withProject(path: string): string {
    const { projectId } = scope()
    if (!projectId) throw new Error('No active project selected')
    return withParam(path, 'projectId', projectId)
  }

  return {
    /** The org and project this client's calls name right now: what its cache keys should carry. */
    scope,

    /** An absolute URL for a stream (`fetch`/`EventSource`) under this client's project. */
    projectUrl(path: string): string {
      return `${API_BASE}${withProject(path)}`
    },

    // Project-scoped endpoints (require active project)

    listWorkflows(opts?: PaginationOptions): Promise<PaginatedResponse<WorkflowSummary>> {
      return request(withPagination(withProject('/workflows'), opts))
    },

    getWorkflow(id: string): Promise<WorkflowSummary> {
      return request(withProject(`/workflows/${pathSegment(id)}`))
    },

    getWorkflowFull(id: string, versionId?: string): Promise<WorkflowFull> {
      const params = versionId ? `?version=${encodeURIComponent(versionId)}` : ''
      return request(withProject(`/workflows/${pathSegment(id)}/full${params}`))
    },

    /** The workflow page's summary, addressed in this client's project. */
    getWorkflowPageSummary(id: string): Promise<ApiWorkflowPageSummary> {
      return request(withProject(`/workflows/${pathSegment(id)}/summary`))
    },

    // ── Test sessions ──
    //
    // A session is personal: another member's is indistinguishable from one
    // that does not exist, so a 404 here needs no special handling.

    getTestSession(workflowId: string): Promise<{ session: TestSession | null }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/test-sessions`))
    },

    /** Starts one, or returns the session this user already has. */
    startTestSession(workflowId: string): Promise<StartTestSessionResponse> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/test-sessions`), {
        method: 'POST',
      })
    },

    /**
     * Invokes the session's worker. Takes a timeout because the thing being
     * called is the user's own half-written code: a handler that never returns
     * would otherwise leave the UI waiting with no way to stop it.
     */
    triggerTestSession(
      sessionId: string,
      payload: unknown,
      options?: { timeoutMs?: number },
    ): Promise<TestSessionTriggerResponse> {
      return request(withProject(`/test-sessions/${pathSegment(sessionId)}/trigger`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
        ...(options?.timeoutMs !== undefined && { signal: AbortSignal.timeout(options.timeoutMs) }),
      })
    },

    stopTestSession(sessionId: string): Promise<{ status: string }> {
      return request(withProject(`/test-sessions/${pathSegment(sessionId)}`), {
        method: 'DELETE',
      })
    },

    /** Provider capabilities: handler kinds, queue rules, schedules, binding kinds. */
    getProviders(): Promise<{ providers: ProviderCapabilities[] }> {
      return request('/providers')
    },

    getWorkflowSource(id: string, versionId?: string): Promise<WorkflowSource> {
      const params = versionId ? `?versionId=${encodeURIComponent(versionId)}` : ''
      return request(withProject(`/workflows/${pathSegment(id)}/source${params}`))
    },

    /**
     * The stored files with their hashes and the latest version's identity
     * (no text): what the IDE polls to notice outside changes, from an agent's
     * file write to a canvas save.
     */
    getProjectListing(id: string): Promise<ProjectListing> {
      return request(withProject(`/workflows/${pathSegment(id)}/project`))
    },

    /** The files half of the listing. */
    async getProjectFiles(id: string): Promise<ProjectFileSummary[]> {
      const listing = await request<ProjectListing>(
        withProject(`/workflows/${pathSegment(id)}/project`),
      )
      return listing.files
    },

    getProjectFile(id: string, path: string): Promise<ProjectFileContent> {
      return request(withProject(`/workflows/${pathSegment(id)}/files/${encodeProjectPath(path)}`))
    },

    /** Creates or replaces a file under the given precondition. */
    putProjectFile(
      id: string,
      path: string,
      source: string,
      precondition: WritePrecondition,
    ): Promise<ProjectFileSummary> {
      const header: Record<string, string> =
        'ifMatch' in precondition
          ? { 'If-Match': `"${precondition.ifMatch}"` }
          : { 'If-None-Match': '*' }
      return projectFileRequest(
        withProject(`/workflows/${pathSegment(id)}/files/${encodeProjectPath(path)}`),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...header },
          body: JSON.stringify({ source }),
        },
      )
    },

    /** What converting the annotation file would produce, without writing anything. */
    previewHandlerConversion(id: string): Promise<HandlerConversionPreview> {
      return request(withProject(`/workflows/${pathSegment(id)}/project/convert-handlers`))
    },

    /** Splits handlers.ts (or the legacy trigger-code setting) into handler modules, atomically on the server. */
    convertHandlers(id: string, ifMatch?: string): Promise<HandlerConversionResult> {
      return projectFileRequest(
        withProject(`/workflows/${pathSegment(id)}/project/convert-handlers`),
        {
          method: 'POST',
          headers: ifMatch ? { 'If-Match': `"${ifMatch}"` } : {},
        },
      )
    },

    /** Always conditional: a delete must name the version it read. */
    deleteProjectFile(id: string, path: string, ifMatch: string): Promise<void> {
      return projectFileRequest(
        withProject(`/workflows/${pathSegment(id)}/files/${encodeProjectPath(path)}`),
        {
          method: 'DELETE',
          headers: { 'If-Match': `"${ifMatch}"` },
        },
      )
    },

    createWorkflow(data: {
      name: string
      description?: string
      kind?: 'workflow' | 'script'
      /** Else the project's first workspace. */
      workspaceId?: string
    }): Promise<WorkflowSummary> {
      return request(withProject('/workflows'), { method: 'POST', body: JSON.stringify(data) })
    },

    updateWorkflow(
      id: string,
      data: {
        name?: string
        description?: string
        envVars?: { name: string; value: string; isSecret?: boolean }[]
        /** The `envVars` text as it was read: the write is refused (409) if they have changed since. */
        envVarsBase?: string
        triggerCode?: string
        dependencies?: Record<string, string>
        deployConfig?: DeployConfig
      },
    ): Promise<WorkflowSummary> {
      return request(withProject(`/workflows/${pathSegment(id)}`), {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    },

    deleteWorkflow(id: string): Promise<void> {
      return request(withProject(`/workflows/${pathSegment(id)}`), { method: 'DELETE' })
    },

    listVersions(
      workflowId: string,
      opts?: PaginationOptions,
    ): Promise<PaginatedResponse<WorkflowVersion>> {
      return request(
        withPagination(withProject(`/workflows/${pathSegment(workflowId)}/versions`), opts),
      )
    },

    getVersion(workflowId: string, versionId: string): Promise<WorkflowVersion> {
      return request(
        withProject(`/workflows/${pathSegment(workflowId)}/versions/${pathSegment(versionId)}`),
      )
    },

    /**
     * Saves `ir` as the current version. With `baseGraphHash` (the loaded
     * `WorkflowFull.graphHash`, or the last save's) the server refuses with a
     * `VersionConflictError` when the graph moved meanwhile, writing nothing.
     */
    createVersion(
      workflowId: string,
      data: { ir: unknown; baseGraphHash?: string },
    ): Promise<SavedVersion> {
      return versionRequest(withProject(`/workflows/${pathSegment(workflowId)}/versions`), {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    /** Snapshots the live project files into the current version; a workflow with no version answers 404. */
    commitVersion(workflowId: string): Promise<SavedVersion> {
      return versionRequest(withProject(`/workflows/${pathSegment(workflowId)}/versions/commit`), {
        method: 'POST',
      })
    },

    lockVersion(workflowId: string, versionId: string, locked: boolean): Promise<WorkflowVersion> {
      return request(
        withProject(`/workflows/${pathSegment(workflowId)}/versions/${pathSegment(versionId)}`),
        {
          method: 'PATCH',
          body: JSON.stringify({ locked }),
        },
      )
    },

    revertToVersion(workflowId: string, versionId: string): Promise<SavedVersion> {
      return request(
        withProject(
          `/workflows/${pathSegment(workflowId)}/versions/${pathSegment(versionId)}/revert`,
        ),
        {
          method: 'POST',
        },
      )
    },

    deleteVersion(workflowId: string, versionId: string): Promise<void> {
      return request(
        withProject(`/workflows/${pathSegment(workflowId)}/versions/${pathSegment(versionId)}`),
        {
          method: 'DELETE',
        },
      )
    },

    // Org-scoped endpoints (require active organization)

    listConnections(opts?: PaginationOptions): Promise<PaginatedResponse<ConnectionSummary>> {
      return request(withPagination(withOrg('/connections'), opts))
    },

    createConnection(data: {
      name: string
      provider: string
      credentials: Record<string, string>
    }): Promise<ConnectionSummary> {
      return request(withOrg('/connections'), { method: 'POST', body: JSON.stringify(data) })
    },

    /** The accounts Deploy offers this workflow (its project's), the one already chosen. */
    getDeployConnections(workflowId: string): Promise<DeployConnections> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/deploy-connections`))
    },

    getDeployConfig(
      workflowId: string,
      connectionId: string,
    ): Promise<{
      config: Record<string, unknown>
      provider: string
      preview: { filename: string; content: Record<string, unknown> }
      uiSchema?: {
        groups: Array<{
          title: string
          description?: string
          fields: Array<{
            path: string
            label?: string
            help?: string
            placeholder?: string
            widget?: string
            visibleWhen?: { path: string; truthy: true }
            defaultObject?: Record<string, unknown>
            advanced?: boolean
          }>
        }>
      }
    }> {
      return request(
        withProject(
          `/workflows/${pathSegment(workflowId)}/deploy-config/${pathSegment(connectionId)}`,
        ),
      )
    },

    getDeployConfigPreview(
      workflowId: string,
      connectionId: string,
      config: Record<string, unknown>,
    ): Promise<{ filename: string; content: Record<string, unknown> }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/deploy-config-preview`), {
        method: 'POST',
        body: JSON.stringify({ connectionId, config }),
      })
    },

    listDeployments(
      workflowId: string,
      opts?: PaginationOptions,
    ): Promise<PaginatedResponse<DeploymentSummary>> {
      return request(
        withPagination(withProject(`/workflows/${pathSegment(workflowId)}/deployments`), opts),
      )
    },

    listAllDeployments(opts?: PaginationOptions): Promise<PaginatedResponse<DeploymentSummary>> {
      return request(withPagination(withProject('/deployments'), opts))
    },

    listWorkflowRuns(
      workflowId: string,
      opts?: PaginationOptions,
    ): Promise<PaginatedResponse<RunSummary>> {
      return request(
        withPagination(withProject(`/workflows/${pathSegment(workflowId)}/runs`), opts),
      )
    },

    getWorkflowRun(workflowId: string, runId: string): Promise<RunSummary> {
      return request(
        withProject(`/workflows/${pathSegment(workflowId)}/runs/${pathSegment(runId)}`),
      )
    },

    getWorkflowRunSteps(workflowId: string, runId: string): Promise<RunStepsResponse> {
      return request(
        withProject(`/workflows/${pathSegment(workflowId)}/runs/${pathSegment(runId)}/steps`),
      )
    },

    controlWorkflowRun(
      workflowId: string,
      runId: string,
      action: 'pause' | 'resume' | 'terminate',
    ): Promise<RunSummary> {
      return request(
        withProject(
          `/workflows/${pathSegment(workflowId)}/runs/${pathSegment(runId)}/${pathSegment(action)}`,
        ),
        {
          method: 'POST',
        },
      )
    },

    takedownDeployment(
      workflowId: string,
      connectionId: string,
    ): Promise<{ success: boolean; error?: string }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/takedown`), {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      })
    },

    verifyCredentials(
      provider: string,
      credentials: Record<string, string>,
    ): Promise<{ valid: boolean; accounts: { id: string; name: string }[] }> {
      return request(withOrg('/connections/verify-token'), {
        method: 'POST',
        body: JSON.stringify({ provider, credentials }),
      })
    },

    triggerWorkflow(
      workflowId: string,
      data: { connectionId: string; params?: unknown },
    ): Promise<{ id: string; instanceId: string; status: string }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/trigger`), {
        method: 'POST',
        body: JSON.stringify(data),
      })
    },

    // Local dev
    startLocalDev(
      workflowId: string,
    ): Promise<{ status: string; port: number; url: string; pid: number }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/local-dev/start`), {
        method: 'POST',
        body: '{}',
      })
    },

    stopLocalDev(workflowId: string): Promise<{ status: string }> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/local-dev/stop`), {
        method: 'POST',
      })
    },

    triggerLocalDev(workflowId: string, params?: unknown): Promise<unknown> {
      return request(withProject(`/workflows/${pathSegment(workflowId)}/local-dev/trigger`), {
        method: 'POST',
        body: JSON.stringify(params ?? {}),
      })
    },

    getLocalDevInstance(workflowId: string, instanceId: string): Promise<unknown> {
      return request(
        withProject(
          `/workflows/${pathSegment(workflowId)}/local-dev/instance/${pathSegment(instanceId)}`,
        ),
      )
    },

    getLocalDevLogs(
      workflowId: string,
      since?: number,
    ): Promise<{ timestamp: number; stream: 'stdout' | 'stderr'; text: string }[]> {
      const params = since ? `?since=${encodeURIComponent(since)}` : ''
      return request(withProject(`/workflows/${pathSegment(workflowId)}/local-dev/logs${params}`))
    },

    listApiKeys(
      opts?: PaginationOptions & { projectId?: string },
    ): Promise<PaginatedResponse<ApiKeySummary>> {
      const base = withOrg('/api-keys')
      const url = opts?.projectId ? `${base}&projectId=${encodeURIComponent(opts.projectId)}` : base
      return request(withPagination(url, opts))
    },

    createApiKey(data: {
      name: string
      /** With a projectId the key is project-level; without, organization-level. */
      projectId?: string
      scopes: string[]
      expiresAt?: string | null
    }): Promise<ApiKeyCreated> {
      return request(withOrg('/api-keys'), { method: 'POST', body: JSON.stringify(data) })
    },

    revokeApiKey(id: string): Promise<ApiKeySummary> {
      return request(withOrg(`/api-keys/${pathSegment(id)}`), { method: 'DELETE' })
    },

    // Projects (org-scoped)

    listProjects(opts?: PaginationOptions): Promise<PaginatedResponse<ProjectSummary>> {
      return request(withPagination(withOrg('/projects'), opts))
    },

    createProject(data: {
      name: string
      slug: string
      description?: string
    }): Promise<ProjectSummary> {
      return request(withOrg('/projects'), { method: 'POST', body: JSON.stringify(data) })
    },

    updateProject(
      id: string,
      data: { name?: string; description?: string },
    ): Promise<ProjectSummary> {
      return request(withOrg(`/projects/${pathSegment(id)}`), {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    },

    deleteProject(id: string): Promise<void> {
      return request(withOrg(`/projects/${pathSegment(id)}`), { method: 'DELETE' })
    },
  }
}

export interface ProjectSummary {
  id: string
  organizationId: string
  name: string
  slug: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export type ApiClient = ReturnType<typeof createApiClient>

export const api = createApiClient(storeScope)

export function projectUrl(path: string): string {
  return api.projectUrl(path)
}
