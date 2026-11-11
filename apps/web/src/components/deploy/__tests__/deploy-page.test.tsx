import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeployConnections, LiveDeployment } from '@awaitstep/ir'
import {
  cloudflareDefaultDeploymentConfig,
  cloudflareDeploymentConfigUiSchema,
} from '@awaitstep/provider-cloudflare'
import type * as ApiClient from '../../../lib/api-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const getDeployConnections = vi.hoisted(() => vi.fn())
const getDeployConfig = vi.hoisted(() => vi.fn())
const getDeployConfigPreview = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  api: { getDeployConnections, getDeployConfig, getDeployConfigPreview },
}))

// The stream itself is the hook's; the page only reads its state.
const stream = vi.hoisted(() => ({
  state: 'idle' as 'idle' | 'deploying' | 'success' | 'error',
  progress: null,
  error: null as string | null,
  result: null as { url?: string } | null,
  reachedStage: null as string | null,
  startedAt: null as number | null,
  finishedAt: null as number | null,
  failure: null as 'server' | 'connection' | null,
  startDeploy: vi.fn(),
  retry: vi.fn(),
}))
const streamSignal = vi.hoisted(() => ({ n: 0, listeners: new Set<() => void>() }))
vi.mock('../../../hooks/use-deploy-stream', async () => {
  const React = await import('react')
  function subscribe(listener: () => void) {
    streamSignal.listeners.add(listener)
    return () => streamSignal.listeners.delete(listener)
  }
  return {
    useDeployStream: () => {
      React.useSyncExternalStore(subscribe, () => streamSignal.n)
      return stream
    },
  }
})

/** Moves the mocked deploy on, re-rendering the page as the real hook's state would. */
function setStream(patch: Partial<typeof stream>) {
  Object.assign(stream, patch)
  streamSignal.n++
  streamSignal.listeners.forEach((listener) => listener())
}
vi.mock('../../navigation/router-shell-link', () => ({
  RouterShellLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { useOrgStore } from '../../../stores/org-store'
import { DeployPage } from '../deploy-page'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'

// Deploy on one screen (25a–25f): the project's accounts with the workspace's
// default chosen, every setting with its value, and what this deploy changes
// against what is live on that account.

function account(id: string, name: string, scope: 'shared' | 'project' = 'shared') {
  return {
    id,
    provider: 'cloudflare',
    name,
    accountSuffix: id.slice(-4),
    scope,
    tokenStatus: 'active' as const,
    tokenExpiresAt: null,
    authKind: 'api-token' as const,
    canDeploy: true,
  }
}

function liveOn(id: string, version: number, over: Partial<LiveDeployment> = {}): LiveDeployment {
  return {
    id,
    name: 'Acme production',
    deploymentId: `d-${id}`,
    callable: true,
    versionId: `v-${version}`,
    version,
    versionLocked: false,
    deployedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    deployedByName: 'Ama',
    ...over,
  }
}

const DEFAULTS = { ...cloudflareDefaultDeploymentConfig } as Record<string, unknown>

function settings(config: Record<string, unknown> = DEFAULTS) {
  return {
    config,
    defaults: DEFAULTS,
    provider: 'cloudflare',
    preview: { filename: 'wrangler.json', content: {} },
    uiSchema: cloudflareDeploymentConfigUiSchema,
  }
}

const TWO: DeployConnections = {
  connections: [
    account('c-prod7f2a', 'Acme production'),
    account('c-ownb84d', 'Checkout staging', 'project'),
  ],
  defaultId: 'c-ownb84d',
  deployedWith: [],
}

function renderPage(props: { connectionId?: string; kind?: 'workflow' | 'script' } = {}) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EditorScopeProvider value={{ org: 'acme', project: 'project-101', workspace: 'sales' }}>
        <DeployPage workflowId="wf-1" version={13} {...props} />
      </EditorScopeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getDeployConnections.mockReset()
  getDeployConfig.mockReset()
  getDeployConfigPreview.mockReset()
  getDeployConfig.mockResolvedValue(settings())
  getDeployConfigPreview.mockResolvedValue({
    filename: 'wrangler.json',
    content: { workers_dev: true },
  })
  Object.assign(stream, {
    state: 'idle',
    error: null,
    result: null,
    reachedStage: null,
    startedAt: null,
    finishedAt: null,
    failure: null,
  })
  stream.startDeploy.mockReset()
  stream.retry.mockReset()
  useOrgStore.setState({
    appReady: true,
    organizations: [{ id: 'org-1', name: 'Acme', slug: 'acme', createdAt: '' }],
    activeOrganizationId: 'org-1',
    activeProjectId: 'p-1',
  })
})

describe('DeployPage account', () => {
  it('starts on the default account and changes to another the project has', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage()
    const card = await screen.findByRole('region', { name: 'Account' })
    expect(card).toHaveTextContent('Checkout staging')
    expect(card).toHaveTextContent('Default')
    expect(card).toHaveTextContent('Cloudflare account ••••b84d')
    await screen.findByText('Settings')
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-ownb84d')

    await userEvent.click(within(card).getByRole('button', { name: 'Change' }))
    const other = await screen.findByRole('menuitem', { name: /Acme production/ })
    expect(other).toHaveTextContent('Token valid · ••••7f2a')
    expect(screen.getByRole('menuitem', { name: /Checkout staging/ })).toHaveTextContent('Default')
    await userEvent.click(other)
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-prod7f2a')
    expect(screen.getByRole('region', { name: 'Account' })).toHaveTextContent('Acme production')
  })

  it('starts on the account a Roll back names, and on the default when it isn’t offered', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    const { unmount } = renderPage({ connectionId: 'c-prod7f2a' })
    await screen.findByText('Settings')
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-prod7f2a')
    unmount()
    getDeployConfig.mockClear()
    renderPage({ connectionId: 'c-gone' })
    await screen.findByText('Settings')
    expect(getDeployConfig).toHaveBeenCalledWith('wf-1', 'c-ownb84d')
  })

  it('waits for a pick when the project has no default', async () => {
    getDeployConnections.mockResolvedValue({ ...TWO, defaultId: null })
    renderPage()
    expect(await screen.findByText('Pick an account to see its settings.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deploy v13' })).toBeDisabled()
    expect(getDeployConfig).not.toHaveBeenCalled()
  })

  it('says Deploy stays disabled without an account, and links to the project’s Connections', async () => {
    getDeployConnections.mockResolvedValue({ connections: [], defaultId: null, deployedWith: [] })
    renderPage()
    expect(await screen.findByText('No account connected yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Connections' })).toHaveAttribute(
      'href',
      '/acme/project-101/connections',
    )
  })
})

describe('DeployPage settings', () => {
  it('shows each group’s values and whether it is the default', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    getDeployConfig.mockResolvedValue(settings({ ...DEFAULTS, cronTriggers: ['0 */6 * * *'] }))
    renderPage()
    const scheduling = await screen.findByRole('button', { name: /Scheduling/ })
    expect(scheduling).toHaveTextContent('Cron 0 */6 * * *')
    expect(scheduling).toHaveTextContent('Changed')
    expect(screen.getByRole('button', { name: /Preview & access/ })).toHaveTextContent('Default')
    expect(screen.getByText('1 changed from the defaults')).toBeVisible()
  })

  it('opens one group at a time, and an edit updates its line and tag', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage()
    const scheduling = await screen.findByRole('button', { name: /Scheduling/ })
    expect(screen.getByText('All at their defaults')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: /Routing/ }))
    expect(screen.getByText('Route patterns')).toBeVisible()
    await userEvent.click(scheduling)
    expect(screen.queryByText('Route patterns')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add to Cron triggers' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Cron triggers 1' }), '0 * * * *')
    expect(scheduling).toHaveTextContent('Cron 0 * * * *')
    expect(scheduling).toHaveTextContent('Changed')
    expect(screen.getByText('1 changed from the defaults')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(screen.getByText('All at their defaults')).toBeVisible()
    expect(scheduling).toHaveTextContent('Default')
  })
})

describe('DeployPage summary', () => {
  it('compares with what is live on the account', async () => {
    getDeployConnections.mockResolvedValue({ ...TWO, deployedWith: [liveOn('c-ownb84d', 12)] })
    let answer!: (value: ReturnType<typeof settings>) => void
    getDeployConfig.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderPage()
    // Nothing is said about the difference before the settings are in.
    await screen.findByText(/v13 replaces v12/)
    expect(screen.queryByText('Same as what is live')).not.toBeInTheDocument()
    answer(settings())
    expect(await screen.findByText('Same as what is live')).toBeVisible()
    expect(screen.getByText(/v13 replaces v12, deployed/)).toBeVisible()
    // It runs through the API (D-8): the worker's own URL is never shown.
    expect(screen.getByText(/\/api\/run\/wf-1$/)).toBeVisible()
    expect(document.body).not.toHaveTextContent('acme.workers.dev')
    expect(screen.getByText('v12 keeps serving until this one is live.')).toBeVisible()

    await userEvent.click(await screen.findByRole('button', { name: /Preview & access/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Preview URLs' }))
    expect(screen.getByText('1 change from the live deployment')).toBeVisible()
    expect(screen.getByText('(was on)')).toBeVisible()
  })

  it('says so on a first deploy to the account, and publishes a function', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage({ kind: 'script' })
    expect(await screen.findByText('First deploy to this account')).toBeVisible()
    expect(screen.getByText('v13, the first deploy to this account')).toBeVisible()
    expect(screen.getByText(/\/api\/run\/wf-1$/)).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Publish v13' })).toBeEnabled()
  })

  it('won’t deploy over a locked version', async () => {
    getDeployConnections.mockResolvedValue({
      ...TWO,
      deployedWith: [liveOn('c-ownb84d', 12, { versionLocked: true })],
    })
    renderPage()
    expect(await screen.findByText('The version deployed on this account is locked.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Deploy v13' })).toBeDisabled()
  })

  it('asks for the generated file only once it is opened', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage()
    const toggle = await screen.findByRole('button', { name: /wrangler\.json/ })
    expect(getDeployConfigPreview).not.toHaveBeenCalled()
    await userEvent.click(toggle)
    expect(await screen.findByText(/"workers_dev": true/)).toBeVisible()
    expect(getDeployConfigPreview).toHaveBeenCalledWith('wf-1', 'c-ownb84d', DEFAULTS)
  })

  it('deploys with the account and the settings as edited', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage()
    await screen.findByRole('button', { name: /Preview & access/ })
    await userEvent.click(screen.getByRole('button', { name: /Preview & access/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Preview URLs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deploy v13' }))
    expect(stream.startDeploy).toHaveBeenCalledWith('c-ownb84d', {
      ...DEFAULTS,
      previewUrls: false,
    })
  })
})

describe('DeployPage progress', () => {
  it('shows three phases while deploying, and keeps the account from changing', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    Object.assign(stream, { state: 'deploying', reachedStage: 'DEPLOYING', startedAt: Date.now() })
    renderPage()
    const card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent('Deploying v13')
    expect(card).toHaveTextContent('Compiled')
    expect(card).toHaveTextContent('Creating the worker')
    expect(card).toHaveTextContent('Not reached')
    expect(card).toHaveTextContent('You can leave this page — it keeps going.')
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled()
  })

  it('shows the API curl and the next places to go once live', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    Object.assign(stream, {
      state: 'success',
      reachedStage: 'COMPLETED',
      startedAt: Date.now() - 38_000,
      finishedAt: Date.now(),
      result: {
        url: 'https://lead-enrichment.acme.workers.dev',
        dashboardUrl: 'https://dash.cloudflare.com/x',
      },
    })
    const { unmount } = renderPage()
    let card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent('v13 is live')
    expect(card).toHaveTextContent('Deployed just now · 38s')
    // The API runs it with a key (D-8); the deploy's own URL isn't the way in.
    expect(card).toHaveTextContent(
      /curl -X POST '.*\/api\/run\/wf-1' -H 'Authorization: Bearer <your key>'/,
    )
    expect(card).not.toHaveTextContent('workers.dev')
    expect(card).toHaveTextContent('Answers with the run it started.')
    expect(
      within(card).getByRole('link', { name: /View in the Cloudflare dashboard/ }),
    ).toBeVisible()
    expect(within(card).getByRole('link', { name: 'View deployments' })).toBeVisible()
    expect(within(card).getByRole('link', { name: 'Back to the workflow' })).toBeVisible()
    unmount()

    renderPage({ kind: 'script' })
    card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent(/curl -X POST '.*\/api\/run\/wf-1'/)
    expect(card).toHaveTextContent('Answers with the function’s own response.')
  })

  it('says it lost the connection, and claims nothing about the outcome', async () => {
    getDeployConnections.mockResolvedValue({ ...TWO, deployedWith: [liveOn('c-ownb84d', 12)] })
    Object.assign(stream, {
      state: 'error',
      failure: 'connection',
      reachedStage: 'GENERATING_CODE',
      error: 'Lost the connection before the deploy finished. It may still be deploying.',
    })
    renderPage()
    const card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent('Lost the connection')
    expect(card).toHaveTextContent('It may still be deploying')
    expect(card).not.toHaveTextContent('Nothing changed')
    expect(card).not.toHaveTextContent('untouched')
    // No Retry: a second deploy could run alongside the first.
    expect(within(card).queryByRole('button', { name: 'Retry deploy' })).not.toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'View deployments' })).toBeVisible()
  })

  it('says where a failure stopped, what the provider said, and only true claims', async () => {
    getDeployConnections.mockResolvedValue({ ...TWO, deployedWith: [liveOn('c-ownb84d', 12)] })
    Object.assign(stream, {
      state: 'error',
      reachedStage: 'DEPLOYING',
      error: 'Authentication error [code: 10000]',
    })
    const { unmount } = renderPage()
    let card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent('Stopped at: creating the worker')
    expect(card).toHaveTextContent('What Cloudflare said')
    expect(card).toHaveTextContent('Authentication error [code: 10000]')
    // The upload had started: nothing is said about what changed.
    expect(card).not.toHaveTextContent('Nothing changed')
    expect(card).not.toHaveTextContent('untouched')
    await userEvent.click(within(card).getByRole('button', { name: 'Retry deploy' }))
    expect(stream.startDeploy).toHaveBeenCalledWith('c-ownb84d', DEFAULTS)
    await userEvent.click(within(card).getByRole('button', { name: 'Back to settings' }))
    expect(stream.retry).toHaveBeenCalled()
    unmount()

    Object.assign(stream, { reachedStage: 'GENERATING_CODE', error: 'Type error in step 2' })
    renderPage()
    card = await screen.findByRole('region', { name: 'Deploy progress' })
    expect(card).toHaveTextContent('Stopped at: compiling')
    // Our own refusal, before Cloudflare was asked.
    expect(card).toHaveTextContent('What went wrong')
    expect(card).not.toHaveTextContent('What Cloudflare said')
    expect(card).toHaveTextContent('v12 is untouched and still serving.')
    expect(card).toHaveTextContent('Nothing changed on Cloudflare.')
  })

  it('keeps edits through Back to settings, and Retry sends them', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    stream.retry.mockImplementation(() => setStream({ state: 'idle', failure: null }))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Preview & access/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Preview URLs' }))
    act(() =>
      setStream({ state: 'error', failure: 'server', reachedStage: 'DEPLOYING', error: 'boom' }),
    )
    const card = screen.getByRole('region', { name: 'Deploy progress' })
    await userEvent.click(within(card).getByRole('button', { name: 'Retry deploy' }))
    expect(stream.startDeploy).toHaveBeenLastCalledWith('c-ownb84d', {
      ...DEFAULTS,
      previewUrls: false,
    })
    await userEvent.click(within(card).getByRole('button', { name: 'Back to settings' }))
    expect(screen.getByRole('button', { name: /Preview & access/ })).toHaveTextContent('Changed')
    expect(screen.getByRole('switch', { name: 'Preview URLs' })).not.toBeChecked()
  })

  it('leaves out list items added but never filled in', async () => {
    getDeployConnections.mockResolvedValue(TWO)
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Routing/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add to Custom domains' }))
    expect(screen.getByRole('button', { name: /Routing/ })).toHaveTextContent('Default')
    await userEvent.click(screen.getByRole('button', { name: 'Deploy v13' }))
    expect(stream.startDeploy).toHaveBeenCalledWith('c-ownb84d', DEFAULTS)
  })
})
