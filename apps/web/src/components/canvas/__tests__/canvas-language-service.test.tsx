import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkflowStore } from '../../../stores/workflow-store'
import type { FlowNode } from '../../../stores/workflow-store'
import { CanvasLanguageService } from '../canvas-language-service'

const source = vi.hoisted(() => ({ get: vi.fn(), modules: vi.fn() }))
const service = vi.hoisted(() => ({ calls: [] as unknown[][] }))

vi.mock('../../../contexts/api-client-context', () => ({
  useApiReady: () => true,
  useQueries: () => ({
    workflows: {
      source: (workflowId: string, versionId?: string) => ({
        queryKey: ['workflow-source', workflowId, versionId],
        queryFn: () => source.get(workflowId, versionId),
      }),
      libraryModules: (workflowId: string, slugs: readonly string[]) => ({
        queryKey: ['workflow-library-modules', workflowId, slugs],
        queryFn: () => source.modules(workflowId, slugs),
      }),
    },
  }),
}))
vi.mock('../../../hooks/use-project-language-service', () => ({
  WORKER_SYNC_DELAY_MS: 600,
  useProjectLanguageService: (...args: unknown[]) => {
    service.calls.push(args)
  },
}))

beforeEach(() => {
  source.get.mockReset()
  source.modules.mockReset()
  service.calls.length = 0
  useWorkflowStore.setState({ nodes: [] })
})

describe('CanvasLanguageService', () => {
  it('hands the hook the stored project files of the shown version, with unresolved imports muted', async () => {
    source.get.mockResolvedValue({
      versionId: 'v2',
      files: [
        { path: 'worker.ts', source: 'generated', role: 'entry' },
        { path: 'lib/x.ts', source: 'export const x = 1', role: 'module', hash: 'hx' },
        { path: 'steps/abc.ts', source: 'return 1', role: 'source' },
        { path: 'package.json', source: '{}', role: 'meta', hash: 'hp' },
      ],
      diagnostics: [],
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CanvasLanguageService workflowId="wf" versionParam="v2" editable={false} />
      </QueryClientProvider>,
    )
    expect(source.get).toHaveBeenCalledWith('wf', 'v2')
    await waitFor(() => {
      const last = service.calls.at(-1)!
      expect([...(last[1] as Map<string, unknown>).keys()]).toEqual(['lib/x.ts', 'package.json'])
    })
    const last = service.calls.at(-1)!
    expect(last[0]).toBe('wf')
    expect(last[2]).toEqual({ reportUnresolvedImports: false })
    // Before the files arrived the hook was already mounted, with nothing to install.
    expect((service.calls[0]![1] as Map<string, unknown>).size).toBe(0)
  })

  it('adds the Library modules the bundle carries, and no other hash-less file', async () => {
    source.get.mockResolvedValue({
      versionId: 'v2',
      files: [
        { path: 'worker.ts', source: 'generated', role: 'entry' },
        { path: 'lib/x.ts', source: 'export const x = 1', role: 'module', hash: 'hx' },
        { path: 'modules/lead-scoring/index.ts', source: 'export const score = 1', role: 'module' },
        { path: 'modules/other/index.ts', source: 'export const o = 1', role: 'module' },
      ],
      library: [{ itemId: 'i1', slug: 'lead-scoring', owner: 'workspace', version: '1.4.2' }],
      diagnostics: [],
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CanvasLanguageService workflowId="wf" editable />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      const last = service.calls.at(-1)!
      expect([...(last[1] as Map<string, unknown>).keys()]).toEqual([
        'lib/x.ts',
        'modules/lead-scoring/index.ts',
      ])
    })
  })

  it('fetches a module only a step’s unsaved code imports, and gives the editor its files', async () => {
    source.get.mockResolvedValue({
      versionId: 'v2',
      files: [
        { path: 'lib/x.ts', source: 'export const x = 1', role: 'module', hash: 'hx' },
        { path: 'steps/s1.ts', source: 'return 1', role: 'module' },
      ],
      library: [],
      diagnostics: [],
    })
    source.modules.mockResolvedValue({
      modules: [{ itemId: 'i1', slug: 'solo', owner: 'workspace', version: '1.0.0' }],
      files: [{ path: 'modules/solo/index.ts', source: 'export const a = 1', role: 'module' }],
      diagnostics: [],
    })
    const step = {
      id: 's1',
      data: {
        irNode: { id: 's1', type: 'step', data: { code: "import { a } from '#modules/solo'" } },
      },
    } as unknown as FlowNode
    useWorkflowStore.setState({ nodes: [step] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CanvasLanguageService workflowId="wf" editable />
      </QueryClientProvider>,
    )
    await waitFor(
      () => {
        const last = service.calls.at(-1)!
        expect([...(last[1] as Map<string, unknown>).keys()]).toEqual([
          'lib/x.ts',
          'modules/solo/index.ts',
        ])
      },
      { timeout: 3000 },
    )
    expect(source.modules).toHaveBeenCalledWith('wf', ['solo'])
  })

  it('asks for nothing while the canvas cannot be edited (an older version, view-only)', async () => {
    source.get.mockResolvedValue({ versionId: 'v1', files: [], library: [], diagnostics: [] })
    const step = {
      id: 's1',
      data: { irNode: { id: 's1', type: 'step', data: { code: "import '#modules/solo'" } } },
    } as unknown as FlowNode
    useWorkflowStore.setState({ nodes: [step] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CanvasLanguageService workflowId="wf" versionParam="v1" editable={false} />
      </QueryClientProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(source.modules).not.toHaveBeenCalled()
  })

  it('asks for nothing before the saved bundle is known, so saved imports are not fetched again', async () => {
    source.get.mockReturnValue(new Promise(() => {}))
    const step = {
      id: 's1',
      data: { irNode: { id: 's1', type: 'step', data: { code: "import '#modules/solo'" } } },
    } as unknown as FlowNode
    useWorkflowStore.setState({ nodes: [step] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CanvasLanguageService workflowId="wf" editable />
      </QueryClientProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(source.modules).not.toHaveBeenCalled()
  })
})
