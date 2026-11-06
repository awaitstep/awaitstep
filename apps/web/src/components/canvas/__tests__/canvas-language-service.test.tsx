import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasLanguageService } from '../canvas-language-service'

const source = vi.hoisted(() => ({ get: vi.fn() }))
const service = vi.hoisted(() => ({ calls: [] as unknown[][] }))

vi.mock('../../../contexts/api-client-context', () => ({
  useApiReady: () => true,
  useQueries: () => ({
    workflows: {
      source: (workflowId: string, versionId?: string) => ({
        queryKey: ['workflow-source', workflowId, versionId],
        queryFn: () => source.get(workflowId, versionId),
      }),
    },
  }),
}))
vi.mock('../../../hooks/use-project-language-service', () => ({
  useProjectLanguageService: (...args: unknown[]) => {
    service.calls.push(args)
  },
}))

beforeEach(() => {
  source.get.mockReset()
  service.calls.length = 0
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
        <CanvasLanguageService workflowId="wf" versionParam="v2" />
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
})
