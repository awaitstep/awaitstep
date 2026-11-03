/**
 * Cloudflare-only binding primitives.
 *
 * Importing this module marks the workflow as Cloudflare-only: a deploy to
 * any other provider is refused before generation, naming this import. The
 * accessors are deliberately thin — the real type comes from the generated
 * `Env` interface — so this module stays import-free and can be emitted into
 * a bundle as-is.
 */

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
