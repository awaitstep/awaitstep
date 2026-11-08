#!/usr/bin/env node
// End-to-end check for the page-data endpoints (plan/page-data-endpoints.md).
//
// Run against a live API, once per dialect:
//
//   BASE_URL=http://127.0.0.1:3000 E2E_COOKIE='session=…' E2E_ORG=acme \
//   E2E_PROJECT=project-101 E2E_PROJECT_ID=p-101 \
//   E2E_WORKSPACE=sales E2E_WORKSPACE_ID=ws-sales \
//   E2E_WORKFLOW=wf_1 E2E_WORKFLOW_ID=w-1 E2E_RUN=run_1 \
//   node scripts/e2e/page-data-endpoints.mjs
//
// Every request, status and body is printed. The script exits non-zero on the
// first unmet expectation. It never writes anything.

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const cookie = process.env.E2E_COOKIE
const org = process.env.E2E_ORG
const project = process.env.E2E_PROJECT
const projectId = process.env.E2E_PROJECT_ID
const workspace = process.env.E2E_WORKSPACE
const workspaceId = process.env.E2E_WORKSPACE_ID
const workflowId = process.env.E2E_WORKFLOW_ID

if (!cookie || !org) {
  console.error('E2E_COOKIE and E2E_ORG are required')
  process.exit(2)
}

let failures = 0

function fail(message) {
  failures += 1
  console.error(`FAIL: ${message}`)
}

function hasKey(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  console.log(`\n${method} ${path}\n  ${response.status} ${text.slice(0, 1200)}`)
  return { status: response.status, body: parsed }
}

function expectKeys(body, keys, what) {
  if (!body || typeof body !== 'object') return fail(`${what}: no JSON object`)
  for (const key of keys) if (!hasKey(body, key)) fail(`${what}: missing ${key}`)
}

function forbidKeys(value, keys, what) {
  if (!value || typeof value !== 'object') return
  for (const key of keys) if (hasKey(value, key)) fail(`${what}: carries ${key}`)
}

const only = (list) => (Array.isArray(list) ? list : [])

async function main() {
  const scope = await call('GET', `/api/scope?org=${encodeURIComponent(org)}`)
  if (scope.status !== 200) fail('GET /scope')
  if (scope.body?.found) forbidKeys(scope.body.org, ['members'], 'scope.org')

  const count = await call('GET', `/api/notifications/count?org=${encodeURIComponent(org)}`)
  if (count.status !== 200) fail('GET /notifications/count')
  expectKeys(count.body, ['unread'], 'notifications/count')

  const members = await call('GET', `/api/members?org=${encodeURIComponent(org)}`)
  if (members.status !== 200) fail('GET /members?org')
  const emails = only(members.body?.data).filter((row) => hasKey(row, 'email'))
  console.log(`  members with an email field: ${emails.length}`)

  let resolvedProjectId = projectId
  if (!resolvedProjectId && project) {
    const projects = await call('GET', `/api/projects?org=${encodeURIComponent(org)}`)
    if (projects.status !== 200) fail('GET /projects')
    for (const row of only(projects.body?.data)) {
      forbidKeys(row, ['members'], 'projects row')
      forbidKeys(
        row,
        ['envVars', 'triggerCode', 'dependencies', 'deployConfig', 'createdBy', 'sharedBy'],
        'projects row',
      )
    }
    resolvedProjectId = only(projects.body?.data).find((row) => row.slug === project)?.id
  }

  if (resolvedProjectId) {
    const summary = await call(
      'GET',
      `/api/projects/${encodeURIComponent(resolvedProjectId)}/summary?org=${encodeURIComponent(org)}`,
    )
    if (summary.status !== 200) fail('GET /projects/:id/summary')
    expectKeys(summary.body, ['admins', 'projectKeys', 'variables', 'shared'], 'project summary')
    expectKeys(summary.body?.admins, ['count', 'people'], 'project summary admins')
    expectKeys(
      summary.body?.variables,
      ['total', 'own', 'inherited', 'first'],
      'project summary variables',
    )
    expectKeys(summary.body?.shared, ['count', 'first'], 'project summary shared')
    if (only(summary.body?.admins?.people).length > 5) fail('summary admins > 5')
    if (only(summary.body?.variables?.first).length > 2) fail('summary variable names > 2')
    if (only(summary.body?.shared?.first).length > 2) fail('summary shared > 2')

    const keys = await call(
      'GET',
      `/api/api-keys?org=${encodeURIComponent(org)}&project=${encodeURIComponent(project ?? '')}` +
        (resolvedProjectId ? `&projectId=${encodeURIComponent(resolvedProjectId)}` : ''),
    )
    if (![200, 403].includes(keys.status)) fail('GET /api-keys project branch')
    for (const key of [...only(keys.body?.own), ...only(keys.body?.reaching)]) {
      forbidKeys(key, ['organizationId', 'parentKeyId', 'createdBy', 'keyHash'], 'api key row')
    }

    const workflows = await call(
      'GET',
      `/api/workflows?org=${encodeURIComponent(org)}&project=${encodeURIComponent(project ?? '')}` +
        `&projectId=${encodeURIComponent(resolvedProjectId)}`,
    )
    if (workflows.status !== 200) fail('GET /workflows')
    for (const row of only(workflows.body?.data)) {
      forbidKeys(
        row,
        ['envVars', 'triggerCode', 'dependencies', 'deployConfig', 'createdBy', 'sharedBy'],
        'workflow list row',
      )
    }

    const deployments = await call(
      'GET',
      `/api/deployments?org=${encodeURIComponent(org)}&projectId=${encodeURIComponent(resolvedProjectId)}`,
    )
    if (deployments.status !== 200) fail('GET /deployments')
    for (const row of only(deployments.body?.data)) {
      forbidKeys(row, ['configSnapshot', 'createdBy'], 'deployment list row')
    }
  }

  const home = await call('GET', `/api/orgs/${encodeURIComponent(org)}/home-summary`)
  if (home.status !== 200) fail('GET /orgs/:slug/home-summary')
  expectKeys(home.body, ['failing'], 'org home summary')
  expectKeys(home.body?.failing, ['count', 'first'], 'org home summary failing')

  if (workspaceId) {
    const overview = await call(
      'GET',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/overview`,
    )
    if (overview.status !== 200) fail('GET /workspaces/:id/overview')
    expectKeys(
      overview.body,
      ['counts', 'needsAttention', 'recent', 'shared'],
      'workspace overview',
    )
    if (only(overview.body?.recent).length > 4) fail('overview recent > 4')

    const settings = await call(
      'GET',
      `/api/workspaces/${encodeURIComponent(workspaceId)}/settings-counts`,
    )
    if (settings.status !== 200) fail('GET /workspaces/:id/settings-counts')
    expectKeys(settings.body, ['members', 'keys', 'variables'], 'settings counts')

    const detail = await call('GET', `/api/workspaces/${encodeURIComponent(workspaceId)}`)
    if (detail.status !== 200) fail('GET /workspaces/:id')
    forbidKeys(detail.body, ['lockedBy', 'lockedAt'], 'workspace detail')

    if (workspace) {
      const runs = await call(
        'GET',
        `/api/runs?org=${encodeURIComponent(org)}&project=${encodeURIComponent(project ?? '')}` +
          `&workspace=${encodeURIComponent(workspace)}`,
      )
      if (runs.status !== 200) fail('GET /runs (workspace)')
      for (const row of only(runs.body?.data)) {
        forbidKeys(row, ['output', 'error', 'instanceId', 'connectionId'], 'run list row')
      }
    }
  }

  if (workflowId) {
    const summary = await call(
      'GET',
      `/api/workflows/${encodeURIComponent(workflowId)}/summary?org=${encodeURIComponent(org)}` +
        `&projectId=${encodeURIComponent(resolvedProjectId ?? projectId ?? '')}`,
    )
    if (summary.status !== 200) fail('GET /workflows/:id/summary')
    expectKeys(
      summary.body,
      ['currentVersion', 'lastSuccessfulDeploy', 'latestDeploy', 'deployCount', 'runs'],
      'workflow summary',
    )

    const versions = await call(
      'GET',
      `/api/workflows/${encodeURIComponent(workflowId)}/versions?org=${encodeURIComponent(org)}` +
        `&projectId=${encodeURIComponent(resolvedProjectId ?? projectId ?? '')}`,
    )
    if (versions.status !== 200) fail('GET /workflows/:id/versions')
    for (const row of only(versions.body?.data)) forbidKeys(row, ['ir'], 'version list row')

    const deployments = await call(
      'GET',
      `/api/workflows/${encodeURIComponent(workflowId)}/deployments?org=${encodeURIComponent(org)}` +
        `&projectId=${encodeURIComponent(resolvedProjectId ?? projectId ?? '')}`,
    )
    if (deployments.status !== 200) fail('GET /workflows/:id/deployments')
    for (const row of only(deployments.body?.data)) {
      forbidKeys(row, ['configSnapshot', 'createdBy'], 'workflow deployment row')
    }
  }

  const connections = await call('GET', `/api/connections?org=${encodeURIComponent(org)}`)
  if (connections.status !== 200) fail('GET /connections')
  for (const row of only(connections.body?.data)) {
    forbidKeys(row, ['credentials'], 'connection list row')
    if (hasKey(row, 'organizationId') || hasKey(row, 'createdBy')) {
      fail('connection list row carries an internal id')
    }
  }

  const envVars = await call('GET', `/api/env-vars?org=${encodeURIComponent(org)}`)
  if (envVars.status !== 200) fail('GET /env-vars?org')

  const resources = await call('GET', `/api/resources/counts?org=${encodeURIComponent(org)}`)
  if (resources.status !== 200) fail('GET /resources/counts')
  expectKeys(resources.body, ['installedNodes', 'variables'], 'resource counts')

  if (failures > 0) {
    console.error(`\n${failures} expectation(s) failed`)
    process.exit(1)
  }
  console.log('\nAll page-data endpoint expectations passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
