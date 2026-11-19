#!/usr/bin/env node

/**
 * Patches wrangler.jsonc configs with values from environment variables.
 * Used by CI/CD (deploy-cf.yml) to inject deployment-specific configuration
 * without committing secrets or account-specific values.
 *
 * Usage:
 *   node scripts/patch-wrangler-config.mjs [--api-config <path>] [--web-config <path>]
 *
 * The paths default to this repo's apps/api/wrangler.jsonc and
 * apps/web/wrangler.jsonc; a repo that wraps this one passes its own
 * (relative paths resolve against the cwd). Each patched config is written
 * to `wrangler.json` beside its source, which git ignores: the tracked
 * sources are never rewritten with an account's values. Wrangler prefers
 * `wrangler.json` on its own; the web build's vite.config.ts points the
 * Cloudflare plugin at it.
 *
 * All configuration is read from environment variables (prefixed with CF_).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = new URL('..', import.meta.url).pathname

const { values: args } = parseArgs({
  options: {
    'api-config': { type: 'string' },
    'web-config': { type: 'string' },
  },
})
const API_CONFIG = args['api-config']
  ? resolve(args['api-config'])
  : resolve(ROOT, 'apps/api/wrangler.jsonc')
const WEB_CONFIG = args['web-config']
  ? resolve(args['web-config'])
  : resolve(ROOT, 'apps/web/wrangler.jsonc')

function stripJsonComments(text) {
  // Remove single-line comments that are NOT inside strings.
  // Walk character by character to track whether we're inside a string.
  let result = ''
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      result += ch
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      result += ch
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }
    if (!inString && ch === '/' && text[i + 1] === '/') {
      // Skip to end of line
      while (i < text.length && text[i] !== '\n') i++
      result += '\n'
      continue
    }
    result += ch
  }
  // Remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, '$1')
}

function readJsonc(path) {
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(stripJsonComments(raw))
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function env(key) {
  return process.env[key] || undefined
}

// --- API Worker config ---

function patchApiConfig() {
  const configPath = API_CONFIG
  const config = readJsonc(configPath)

  // D1 database ID (required)
  const d1Id = env('CF_D1_DATABASE_ID')
  if (d1Id && config.d1_databases?.[0]) {
    config.d1_databases[0].database_id = d1Id
  }

  // Worker name
  const apiName = env('CF_API_WORKER_NAME')
  if (apiName) {
    config.name = apiName
  }

  // Compatibility date
  const compatDate = env('CF_COMPATIBILITY_DATE')
  if (compatDate) {
    config.compatibility_date = compatDate
  }

  // Container instance type (lite, basic, standard)
  const instanceType = env('CF_CONTAINER_INSTANCE_TYPE')
  if (instanceType && config.containers?.[0]) {
    config.containers[0].instance_type = instanceType
  }

  // Max container instances
  const maxInstances = env('CF_CONTAINER_MAX_INSTANCES')
  if (maxInstances && config.containers?.[0]) {
    config.containers[0].max_instances = parseInt(maxInstances, 10)
  }

  // Custom vars
  const appName = env('CF_APP_NAME')
  if (appName) {
    config.vars = config.vars || {}
    config.vars.APP_NAME = appName
  }

  const registryUrl = env('CF_REGISTRY_URL')
  if (registryUrl) {
    config.vars = config.vars || {}
    config.vars.REGISTRY_URL = registryUrl
  }

  // BETTER_AUTH_URL — always the API worker URL (not sensitive, set as var)
  const apiUrl = env('CF_API_WORKER_URL')
  if (apiUrl) {
    config.vars = config.vars || {}
    config.vars.BETTER_AUTH_URL = apiUrl
  }

  // Sandbox timeout configuration
  const sandboxDeployTimeout = env('CF_SANDBOX_DEPLOY_TIMEOUT')
  if (sandboxDeployTimeout) {
    config.vars = config.vars || {}
    config.vars.SANDBOX_DEPLOY_TIMEOUT = sandboxDeployTimeout
  }

  const sandboxSleepAfter = env('CF_SANDBOX_SLEEP_AFTER')
  if (sandboxSleepAfter) {
    config.vars = config.vars || {}
    config.vars.SANDBOX_SLEEP_AFTER = sandboxSleepAfter
  }

  const outPath = resolve(dirname(API_CONFIG), 'wrangler.json')
  writeJson(outPath, config)
  console.log(`[patch] API config written to ${outPath}`)
  return config
}

// --- Web Worker config ---

function patchWebConfig(apiWorkerName) {
  const configPath = WEB_CONFIG
  const config = readJsonc(configPath)

  // Worker name
  const webName = env('CF_WEB_WORKER_NAME')
  if (webName) {
    config.name = webName
  }

  // API Worker URL (for client-side fetches)
  const apiUrl = env('CF_API_WORKER_URL')
  if (apiUrl) {
    config.vars = config.vars || {}
    config.vars.API_URL = apiUrl
  }

  // The API's node registry: the web's image policy lets its icons load.
  const webRegistryUrl = env('CF_REGISTRY_URL')
  if (webRegistryUrl) {
    config.vars = config.vars || {}
    config.vars.REGISTRY_URL = webRegistryUrl
  }

  // API service binding name (must match the API worker name)
  if (apiWorkerName && config.services?.[0]) {
    config.services[0].service = apiWorkerName
  }

  // Auth method flags
  const magicLink = env('CF_MAGIC_LINK_ENABLED')
  if (magicLink !== undefined) {
    config.vars = config.vars || {}
    config.vars.MAGIC_LINK_ENABLED = magicLink
  }

  const githubEnabled = env('CF_GITHUB_ENABLED')
  if (githubEnabled !== undefined) {
    config.vars = config.vars || {}
    config.vars.GITHUB_ENABLED = githubEnabled
  }

  const googleEnabled = env('CF_GOOGLE_ENABLED')
  if (googleEnabled !== undefined) {
    config.vars = config.vars || {}
    config.vars.GOOGLE_ENABLED = googleEnabled
  }

  // Custom route
  const customRoute = env('CF_WEB_ROUTE')
  if (customRoute) {
    const zoneName = env('CF_WEB_ROUTE_ZONE')
    config.routes = [
      { pattern: customRoute, ...(zoneName ? { zone_name: zoneName } : { custom_domain: true }) },
    ]
  }

  // Custom domain (shorthand — just the domain, no zone needed)
  const customDomain = env('CF_WEB_CUSTOM_DOMAIN')
  if (customDomain && !env('CF_WEB_ROUTE')) {
    config.routes = [{ pattern: customDomain, custom_domain: true }]
  }

  // Compatibility date
  const compatDate = env('CF_COMPATIBILITY_DATE')
  if (compatDate) {
    config.compatibility_date = compatDate
  }

  // Beside the source and gitignored, like the API's; vite.config.ts reads it
  // during the BUILD_TARGET=cf build and generates dist/server/wrangler.json.
  const outPath = resolve(dirname(WEB_CONFIG), 'wrangler.json')
  writeJson(outPath, config)
  console.log(`[patch] Web config written to ${outPath}`)
}

// --- Run ---

const apiConfig = patchApiConfig()
patchWebConfig(apiConfig.name)

console.log('[patch] Done')
