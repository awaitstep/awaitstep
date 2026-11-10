/**
 * Cloudflare-only binding primitives.
 *
 * Importing this module marks the workflow as Cloudflare-only: a deploy to
 * any other provider is refused before generation, naming this import. The
 * accessors are deliberately thin — the real type comes from the generated
 * `Env` interface — so this module stays import-free and can be emitted into
 * a bundle as-is.
 */

/** The Cloudflare resources a workflow can declare. */
export type CloudflareBindingKind =
  | 'kv'
  | 'd1'
  | 'r2'
  | 'queue'
  | 'service'
  | 'workflow'
  | 'ai'
  | 'vectorize'
  | 'analytics_engine'
  | 'hyperdrive'
  | 'browser'

/**
 * One logical binding in a provider profile. The physical resource is chosen
 * per deployment connection, not here.
 */
export type CloudflareBindingConfig =
  | { kind: 'kv' | 'd1' | 'ai' | 'analytics_engine' | 'hyperdrive' | 'browser' }
  | { kind: 'r2'; bucket?: string }
  | { kind: 'queue'; queue?: string }
  | { kind: 'service'; service?: string }
  | { kind: 'workflow'; workflow?: string }
  | { kind: 'vectorize'; index?: string }

/** A workflow's Cloudflare profile: declarations and static wrangler overrides. */
export interface CloudflareProfileConfig {
  bindings?: Record<string, CloudflareBindingConfig>
  wrangler?: Record<string, unknown>
}

/**
 * Declares the Cloudflare resources a workflow uses. This is compile-time
 * data: codegen reads the object literal and never executes it. Resource IDs
 * belong in the deployment connection, not here.
 */
export function defineCloudflare<const Config extends CloudflareProfileConfig>(
  config: Config,
): Config {
  return config
}

/** Resolve a declared binding from the workflow environment. */
export function binding<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return env[name]
}

/** A Cloudflare KV namespace. */
export function kv<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare D1 database. */
export function d1<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare R2 bucket. */
export function r2<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Queue producer binding. */
export function queue<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare service binding to another Worker. */
export function service<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Workflow binding to another deployed workflow. */
export function workflow<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Workers AI binding. */
export function ai<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Vectorize index. */
export function vectorize<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Analytics Engine dataset. */
export function analyticsEngine<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Hyperdrive binding. */
export function hyperdrive<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}

/** A Cloudflare Browser Rendering binding. */
export function browser<Env extends object, Name extends keyof Env & string>(
  env: Env,
  name: Name,
): Env[Name] {
  return binding(env, name)
}
