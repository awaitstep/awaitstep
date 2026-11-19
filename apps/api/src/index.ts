export { createApp } from './app.js'
export type { AppDeps, App } from './app.js'
export { createAuth } from './auth/config.js'
export type { Auth, AuthOptions } from './auth/config.js'
export { createLogger } from './lib/logger.js'
export type { Logger } from './lib/logger.js'
export { buildNodeRegistry, createMergedNodeRegistry } from './lib/node-registry.js'
export type { AppNodeRegistry, RegistryFile } from './lib/node-registry.js'
export type { AppEnv, AppExtension, ScheduledContext } from './types.js'
// The core's scope and role gates, for an extension's routes to compose:
// extension routes get authentication only, and name their own scope.
export { requireSessionAuth } from './middleware/auth.js'
export { requireOrganization, requireProject, requireWorkspace } from './middleware/project.js'
export { requireOrgCan, requireProjectCan, requireWorkspaceCan } from './middleware/access.js'
// The Workers entry's factory (`buildWorkerDeps`, `createWorker`) is the
// `@awaitstep/api/worker` export, not this barrel: it pulls in the Sandbox
// and D1 bindings, which this Node build must not bundle.
