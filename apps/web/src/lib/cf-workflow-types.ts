export const CF_WORKFLOW_TYPE_DEFS = `
// ── Cloudflare Workflows API ──

declare type WorkflowBackoff = "constant" | "linear" | "exponential";

declare interface WorkflowStepConfig {
  retries?: {
    /** Total number of attempts. Use Infinity for unlimited retries. Default: 5 */
    limit: number;
    /** Delay between attempts in ms or human-readable format (e.g. "10 seconds"). Default: 10000 */
    delay: string | number;
    /** Backoff algorithm between retries. Default: "exponential" */
    backoff?: WorkflowBackoff;
  };
  /** Per-attempt timeout in ms or human-readable format (e.g. "10 minutes"). Default: "10 minutes" */
  timeout?: string | number;
}

declare interface StepContext {
  /** Current retry attempt number. 1 on first try, 2 on first retry, etc. */
  attempt: number;
}

declare interface WorkflowStep {
  /** Execute a durable step. Result is persisted — if interrupted, resumes from last successful step. */
  do<T>(name: string, callback: (ctx: StepContext) => Promise<T>): Promise<T>;
  /** Execute a durable step with retry/timeout configuration. */
  do<T>(name: string, config: WorkflowStepConfig, callback: (ctx: StepContext) => Promise<T>): Promise<T>;

  /** Sleep for a relative duration. Accepts ms or human-readable ("10 seconds", "1 hour", "7 days"). Max 365 days. Does NOT count toward step limit. */
  sleep(name: string, duration: string | number): Promise<void>;

  /** Sleep until a specific Date or UNIX timestamp (ms). Does NOT count toward step limit. */
  sleepUntil(name: string, timestamp: Date | number): Promise<void>;

  /** Wait for an external event. Type: alphanumeric + hyphens + underscores only (no dots), max 100 chars. Default timeout: 24 hours, max: 365 days. Throws on timeout — wrap in try-catch to continue. */
  waitForEvent<T = unknown>(name: string, options: { type: string; timeout?: string | number }): Promise<T>;
}

declare interface WorkflowEvent<T = any> {
  /** The input data passed when creating the workflow instance */
  payload: Readonly<T>;
  /** When the instance was created */
  timestamp: Date;
  /** Unique identifier for this run */
  instanceId: string;
}

/** Throw inside step.do() to stop retries immediately and fail the Workflow instance. */
declare class NonRetryableError extends Error {
  constructor(message: string, name?: string);
}

// ── Workflow Globals (available in step callbacks) ──

/** The workflow step object — step.do(), step.sleep(), step.sleepUntil(), step.waitForEvent() */
declare const step: WorkflowStep;

/** The workflow event with trigger payload, timestamp, and instanceId */
declare const event: WorkflowEvent;

/** Step callback context with retry attempt info */
declare const ctx: StepContext;

// ── Cloudflare Workers Environment Bindings ──

declare interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream"; cacheTtl?: number }): Promise<any>;
  getWithMetadata<M = unknown>(key: string, options?: { type?: string }): Promise<{ value: any; metadata: M | null }>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expiration?: number; expirationTtl?: number; metadata?: any }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string; expiration?: number; metadata?: any }[]; list_complete: boolean; cursor?: string }>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
}

declare interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

declare interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: { duration: number; changes: number; last_row_id: number; changed_db: boolean; size_after: number; rows_read: number; rows_written: number };
}

declare interface D1ExecResult {
  count: number;
  duration: number;
}

declare interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, value: ReadableStream | ArrayBuffer | string | Blob | null, options?: { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> }): Promise<R2Object>;
  delete(key: string | string[]): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string; delimiter?: string }): Promise<{ objects: R2Object[]; truncated: boolean; cursor?: string; delimitedPrefixes: string[] }>;
}

declare interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}

declare interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  blob(): Promise<Blob>;
}

declare interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare interface Workflow<T = unknown> {
  /** Create a new workflow instance */
  create(options?: { id?: string; params?: T }): Promise<WorkflowInstance>;
  /** Get an existing workflow instance by ID */
  get(id: string): Promise<WorkflowInstance>;
}

declare interface WorkflowInstance {
  id: string;
  status(): Promise<{ status: string; error?: { name: string; message: string }; output?: unknown }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  terminate(): Promise<void>;
  restart(): Promise<void>;
  sendEvent(event: { type: string; payload?: unknown }): Promise<void>;
}

/** Environment bindings — KV, D1, R2, service bindings, secrets, variables, and workflow bindings */
declare const env: {
  [key: string]: KVNamespace | D1Database | R2Bucket | ServiceBinding | Workflow | string | undefined;
};

// ── Web Platform APIs (available in Workers runtime) ──

declare function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

declare function atob(data: string): string;
declare function btoa(data: string): string;

declare function setTimeout(callback: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(callback: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(id: number): void;

declare const crypto: Crypto;
declare const console: Console;
`
