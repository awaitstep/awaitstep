import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeployConnections, LiveDeployment } from '@awaitstep/ir'
import type * as ApiClient from '../../../lib/api-client'
import { ApiError } from '../../../lib/api-client'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
const getDeployConnections = vi.hoisted(() => vi.fn())
const getProviders = vi.hoisted(() => vi.fn())
const callFunction = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/api-client', async (original) => ({
  ...(await original<typeof ApiClient>()),
  api: { getDeployConnections, callFunction, getProviders },
}))

import { useOrgStore } from '../../../stores/org-store'
import { FunctionCallDialog } from '../function-call-dialog'

// Calling a live function from its page (24i).

function live(id: string, name: string, version: number, callable = true): LiveDeployment {
  return {
    id,
    name,
    deploymentId: `d-${id}`,
    callable,
    versionId: `v-${version}`,
    version,
    versionLocked: false,
    deployedAt: '2026-11-11T08:00:00.000Z',
    deployedByName: null,
  }
}

function renderDialog() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <FunctionCallDialog workflowId="fn-1" runHref={(id) => `/runs/${id}`} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getDeployConnections.mockReset()
  callFunction.mockReset()
  useOrgStore.setState({ activeOrganizationId: 'org-1', activeProjectId: 'p-1' })
  const answer: DeployConnections = {
    connections: [],
    defaultId: null,
    deployedWith: [live('c-prod', 'Acme production', 3)],
  }
  getDeployConnections.mockResolvedValue(answer)
})

describe('FunctionCallDialog', () => {
  it('says which version it calls, and sends the body to that account', async () => {
    callFunction.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      durationMs: 142,
      contentType: 'application/json',
      body: '{"city":"Paris"}',
      truncated: false,
      runId: 'run-9',
    })
    renderDialog()
    expect(await screen.findByText('v3, live on Acme production')).toBeVisible()
    // The API's endpoint, never the worker's own URL (D-8).
    expect(screen.getByText(/\/api\/run\/fn-1$/)).toBeVisible()
    expect(document.body).not.toHaveTextContent('workers.dev')
    const body = screen.getByRole('textbox', { name: 'Body' })
    await userEvent.clear(body)
    await userEvent.type(body, '{{"address":"x"}')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(callFunction).toHaveBeenCalledWith('fn-1', {
      connectionId: 'c-prod',
      body: '{"address":"x"}',
    })
    const response = await screen.findByRole('region', { name: 'Response' })
    expect(response).toHaveTextContent('200 OK')
    expect(response).toHaveTextContent('142 ms')
    expect(response).toHaveTextContent('"city": "Paris"')
    const curl = screen.getByText(/^curl -X POST/)
    expect(curl).toHaveTextContent(/\/api\/run\/fn-1' -H 'Authorization: Bearer <your key>'/)
    // Alone, the account isn't named: the API uses the one it is live on.
    expect(curl).not.toHaveTextContent('account=')
    expect(curl).toHaveTextContent(`-d '{"address":"x"}'`)
    expect(screen.getByText('Calls the live version. Each call is kept in Runs.')).toBeVisible()
    // The call is one of the function's runs: it links there.
    expect(screen.getByRole('link', { name: 'Open this run →' })).toHaveAttribute(
      'href',
      '/runs/run-9',
    )
  })

  it('stops a body that isn’t JSON, and shows the server’s refusal inline', async () => {
    callFunction.mockRejectedValue(
      new ApiError('Only a workers.dev URL can be called from here.', 400),
    )
    renderDialog()
    await screen.findByText('v3, live on Acme production')
    const body = screen.getByRole('textbox', { name: 'Body' })
    await userEvent.clear(body)
    await userEvent.type(body, '{{a:1}')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    await userEvent.clear(body)
    await userEvent.type(body, '{{}')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only a workers.dev URL can be called from here.',
    )
  })

  it('shows why a call got no answer, inline', async () => {
    callFunction.mockResolvedValue({
      ok: false,
      reason: 'The function didn’t answer within 30 s.',
      runId: 'run-10',
    })
    renderDialog()
    await screen.findByText('v3, live on Acme production')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The function didn’t answer within 30 s.',
    )
  })

  it('won’t send to a deployment the server can’t call, and says so', async () => {
    getDeployConnections.mockResolvedValue({
      connections: [],
      defaultId: null,
      deployedWith: [live('c-prod', 'Acme production', 3, false)],
    })
    renderDialog()
    expect(await screen.findByText('This deployment has no URL AwaitStep can call.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('drops an answer when the account changes', async () => {
    getDeployConnections.mockResolvedValue({
      connections: [],
      defaultId: null,
      deployedWith: [live('c-prod', 'Acme production', 3), live('c-stage', 'Checkout staging', 2)],
    })
    callFunction.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      durationMs: 5,
      contentType: 'text/plain',
      body: 'prod answer',
      truncated: false,
    })
    renderDialog()
    await screen.findByText('v3, live on Acme production')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('prod answer')).toBeVisible()
    await userEvent.click(screen.getByRole('combobox', { name: 'Account' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Checkout staging' }))
    expect(screen.getByText('v2, live on Checkout staging')).toBeVisible()
    expect(screen.queryByText('prod answer')).not.toBeInTheDocument()
    // With a choice, the curl names the account picked.
    expect(screen.getByText(/^curl -X POST/)).toHaveTextContent('/api/run/fn-1?account=c-stage')
  })
})
