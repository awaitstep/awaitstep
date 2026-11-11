import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiClientProvider } from '../../../contexts/api-client-context'
import { useOrgStore } from '../../../stores/org-store'
import { RunDetail } from '../run-detail'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  useNavigate: () => navigate,
}))
// The canvas needs a real layout engine; the page's own parts are what's under test.
vi.mock('../run-canvas-preview', () => ({ RunCanvasPreview: () => <div>canvas</div> }))

afterEach(() => {
  useOrgStore.getState().clear()
  vi.restoreAllMocks()
  navigate.mockReset()
})

const RUN = {
  id: 'run_1',
  workflowId: 'wf_1',
  versionId: null,
  versionNumber: 12,
  connectionId: 'con_1',
  instanceId: '16906129',
  status: 'errored',
  output: null,
  error: '{"name":"Error","message":"crm down"}',
  trigger: 'dashboard',
  hasParams: true,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:01:22.000Z',
}

function stepRow(id: string, over: Record<string, unknown>) {
  return {
    id,
    runId: 'run_1',
    nodeId: null,
    kind: 'do',
    stepIndex: 1,
    status: 'complete',
    attemptCount: 1,
    error: null,
    startedAt: '2026-11-05T10:00:01.000Z',
    endedAt: '2026-11-05T10:00:02.000Z',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:02.000Z',
    ...over,
  }
}

const STEPS = {
  data: [
    stepRow('rs_1', { stepName: 'fetch-1' }),
    stepRow('rs_2', {
      stepName: 'crm-1',
      status: 'errored',
      attemptCount: 3,
      error: '{"name":"Error","message":"crm down"}',
      startedAt: '2026-11-05T10:00:03.000Z',
      endedAt: '2026-11-05T10:01:20.000Z',
    }),
  ],
  coalescedInto: {},
}

function serve(extra: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const answer = extra(url, init)
    if (answer) return answer
    if (url.includes('/runs/run_1/steps/rs_2')) {
      return Response.json({
        output: null,
        outputTruncated: false,
        outputPreview: null,
        attempts: [
          {
            start: '2026-11-05T10:00:03.000Z',
            end: '2026-11-05T10:00:04.000Z',
            error: { name: 'Error', message: 'a' },
          },
          {
            start: '2026-11-05T10:00:09.000Z',
            end: '2026-11-05T10:00:10.000Z',
            error: { name: 'Error', message: 'b' },
          },
          {
            start: '2026-11-05T10:01:19.000Z',
            end: '2026-11-05T10:01:20.000Z',
            error: { name: 'Error', message: 'crm down' },
          },
        ],
      })
    }
    if (url.includes('/runs/run_1/steps/rs_1')) {
      return Response.json({
        output: { sent: 3 },
        outputTruncated: false,
        outputPreview: null,
        attempts: [],
      })
    }
    if (url.includes('/runs/run_1/steps')) return Response.json(STEPS)
    if (url.includes('/runs/run_1/params')) return Response.json({ params: { email: 'a@b.c' } })
    if (url.includes('/runs/run_1?')) return Response.json(RUN)
    if (url.includes('/deploy-connections')) {
      return Response.json({
        connections: [{ id: 'con_1', name: 'Acme production' }],
        deployedWith: [],
      })
    }
    return Response.json({ data: [], nextCursor: null })
  })
}

function renderPage() {
  useOrgStore.setState({ appReady: true, activeOrganizationId: 'org_x', activeProjectId: 'prj_x' })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ApiClientProvider
        scope={{ organizationId: 'org_acme', projectId: 'prj_1', workspaceId: 'ws_1' }}
      >
        <RunDetail
          slugs={{ org: 'acme', project: 'core', workspace: 'sales' }}
          runId="run_1"
          workflowId="wf_1"
        />
      </ApiClientProvider>
    </QueryClientProvider>,
  )
}

describe('the run page (26b)', () => {
  it('heads a failed run with Run again and says where it stopped', async () => {
    serve()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Run 16906129' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Run again' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Terminate/ })).not.toBeInTheDocument()
    const band = screen.getByRole('region', { name: 'Run facts' })
    expect(within(band).getByText('Ran for')).toBeVisible()
    expect(await within(band).findByText('Stopped at crm-1')).toBeVisible()
    expect(within(band).getByText('Dashboard')).toBeVisible()
    expect(within(band).getByText('v12')).toBeVisible()
  })

  it('opens on the failed step with its tries, and shows another step’s output when picked', async () => {
    serve()
    renderPage()
    expect(await screen.findByText('Attempt 3 · failed')).toBeVisible()
    expect(screen.getByText('3 attempts')).toBeVisible()
    expect(screen.getByText('Tried 3 times; this is the last error.')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /fetch-1/ }))
    expect(await screen.findByText(/"sent": 3/)).toBeVisible()
  })

  it('shows the payload only when asked', async () => {
    const fetchSpy = serve()
    renderPage()
    const link = await screen.findByRole('button', { name: 'See the payload →' })
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/params'))).toBe(false)
    await userEvent.click(link)
    expect(await screen.findByText(/"email": "a@b.c"/)).toBeVisible()
  })

  it('runs again on the same account and opens the new run', async () => {
    const fetchSpy = serve((url, init) =>
      url.includes('/run-again') && init?.method === 'POST'
        ? Response.json({ ...RUN, id: 'run_2', status: 'queued' }, { status: 201 })
        : undefined,
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Run again' }))
    await waitFor(() => expect(navigate).toHaveBeenCalled())
    const call = fetchSpy.mock.calls.find(([u]) => String(u).includes('/run-again'))!
    expect(JSON.parse(String(call[1]?.body))).toEqual({ connectionId: 'con_1' })
    expect(JSON.stringify(navigate.mock.calls[0])).toContain('/runs/run_2')
  })
})

describe('a function’s run is a call (D-5)', () => {
  const CALL = {
    ...RUN,
    instanceId: 'call_k2j9x0ab12cd',
    status: 'errored',
    output: '{"message":"boom"}',
    error: '{"name":"HttpStatus","message":"Answered 500"}',
    responseStatus: 500,
    durationMs: 288,
  }

  function renderCall() {
    useOrgStore.setState({
      appReady: true,
      activeOrganizationId: 'org_x',
      activeProjectId: 'prj_x',
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ApiClientProvider
          scope={{ organizationId: 'org_acme', projectId: 'prj_1', workspaceId: 'ws_1' }}
        >
          <RunDetail
            slugs={{ org: 'acme', project: 'core', workspace: 'sales' }}
            runId="run_1"
            workflowId="wf_1"
            kind="script"
          />
        </ApiClientProvider>
      </QueryClientProvider>,
    )
  }

  it('shows what came back and how long it took, without a graph or steps', async () => {
    const fetchSpy = serve((url) =>
      url.includes('/runs/run_1?') ? Response.json(CALL) : undefined,
    )
    renderCall()
    expect(await screen.findByRole('heading', { name: 'Call k2j9x0ab12cd' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Call again' })).toBeVisible()
    const band = screen.getByRole('region', { name: 'Run facts' })
    expect(within(band).getByText('Answered 500')).toBeVisible()
    expect(within(band).getByText('288ms')).toBeVisible()
    // The body sent is on the page, before the answer — no dialog for it.
    expect(within(band).queryByRole('button', { name: /See the/ })).not.toBeInTheDocument()
    const request = await screen.findByText(/"email": "a@b.c"/)
    const response = screen.getByText(/"message": "boom"/)
    expect(request).toBeVisible()
    expect(response).toBeVisible()
    expect(
      request.compareDocumentPosition(response) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.queryByText('canvas')).not.toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/steps'))).toBe(false)
  })

  it('shows a body sent as text as it was sent, and says when none was sent', async () => {
    serve((url) => {
      if (url.includes('/runs/run_1?')) return Response.json(CALL)
      if (url.includes('/runs/run_1/params')) return Response.json({ params: 'address=x' })
      return undefined
    })
    renderCall()
    expect(await screen.findByText('address=x')).toBeVisible()
  })

  it('says when a call was sent with no body, without asking for one', async () => {
    const fetchSpy = serve((url) =>
      url.includes('/runs/run_1?') ? Response.json({ ...CALL, hasParams: false }) : undefined,
    )
    renderCall()
    expect(await screen.findByText('Sent with no body.')).toBeVisible()
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('/params'))).toBe(false)
  })

  it('calls again and opens the new call', async () => {
    serve((url, init) => {
      if (url.includes('/runs/run_1?')) return Response.json(CALL)
      if (url.includes('/run-again') && init?.method === 'POST') {
        return Response.json({ ok: false, reason: 'No answer', runId: 'run_3' })
      }
      return undefined
    })
    renderCall()
    await userEvent.click(await screen.findByRole('button', { name: 'Call again' }))
    await waitFor(() => expect(JSON.stringify(navigate.mock.calls[0])).toContain('/runs/run_3'))
  })
})
