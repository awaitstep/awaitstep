import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EditorScopeProvider } from '../../../contexts/editor-scope-context'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { BindingsPanel } from '../bindings-panel'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

const SALES = { org: 'acme', project: 'core', workspace: 'sales' }
const QUEUE_NODE = {
  id: 'n1',
  type: 'step',
  position: { x: 0, y: 0 },
  data: { irNode: { data: { code: 'await env.QUEUE_ORDERS.send(order)' } } },
}

function renderPanel(readOnly: boolean) {
  useWorkflowStore.setState({
    workflowId: 'wf_1',
    nodes: [QUEUE_NODE] as never,
    triggerCode: '',
    readOnly,
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/providers')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            providers: [
              {
                id: 'cloudflare',
                label: 'Cloudflare',
                handlerKinds: ['fetch', 'scheduled', 'queue'],
                queueNamePattern: '^[a-z0-9-]+$',
                importSchemes: ['cloudflare'],
                bindingKinds: ['kv', 'queue'],
                bindingKindLabels: { queue: 'queue' },
                scheduleConfigKey: 'cronTriggers',
              },
            ],
          }),
        ),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify({ handlers: { consumedQueues: [], modules: true } })),
    )
  })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EditorScopeProvider value={SALES}>
        <BindingsPanel />
      </EditorScopeProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('BindingsPanel Consume', () => {
  it('can’t write a consumer while the canvas is read-only (an older version, or a Viewer)', async () => {
    renderPanel(true)
    await userEvent.click(await screen.findByRole('button', { name: /binding/i }))
    const consume = screen.getByRole('button', { name: 'Consume' })
    expect(consume).toBeDisabled()
    expect(consume).toHaveAttribute('title', 'Read-only')
  })

  it('offers it on an editable saved workflow', async () => {
    renderPanel(false)
    await userEvent.click(await screen.findByRole('button', { name: /binding/i }))
    expect(screen.getByRole('button', { name: 'Consume' })).toBeEnabled()
  })
})
