import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { ImportItemDialog } from '../import-item-dialog'

const goTo = vi.fn()
const hook = vi.hoisted(() => ({
  onImported: undefined as ((item: WorkspaceItem) => void) | undefined,
  mutate: vi.fn(),
  source: 'api' as 'api' | 'mock',
}))

vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))
vi.mock('../../../data/dashboard/source', () => ({ useDataSource: () => hook.source }))
vi.mock('../../../data/dashboard/items', () => ({
  useImportItem: (_slugs: unknown, options: { onImported?: (item: WorkspaceItem) => void }) => {
    hook.onImported = options.onImported
    return { mutate: hook.mutate, reset: vi.fn(), isPending: false, error: null }
  },
}))

const sales = { org: 'acme', project: 'core', workspace: 'sales' }

afterEach(() => {
  goTo.mockReset()
  hook.mutate.mockReset()
  hook.onImported = undefined
  hook.source = 'api'
})

async function importFile() {
  render(<ImportItemDialog open onOpenChange={vi.fn()} slugs={sales} />)
  const file = new File(['{}'], 'a.ir.json', { type: 'application/json' })
  await userEvent.upload(screen.getByLabelText(/Workflow file/), file)
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
}

describe('ImportItemDialog', () => {
  it('opens the imported item from the hook, so it still opens once the dialog is gone', async () => {
    await importFile()
    expect(hook.mutate).toHaveBeenCalledWith(
      { fileName: 'a.ir.json', content: '{}' },
      { onSuccess: undefined },
    )
    hook.onImported?.({ id: 'wf_9', kind: 'script' } as WorkspaceItem)
    expect(goTo).toHaveBeenCalledWith('/acme/core/sales/workflows/wf_9')
  })

  it('opens nothing for sample data, which has no editor', async () => {
    hook.source = 'mock'
    await importFile()
    expect(hook.onImported).toBeUndefined()
  })

  it('refuses a file over the API’s 1 MB limit without reading it', async () => {
    render(<ImportItemDialog open onOpenChange={vi.fn()} slugs={sales} />)
    const big = new File(['x'.repeat(1024 * 1024 + 1)], 'big.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(/Workflow file/), big)
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(screen.getByText('That file is over 1 MB, too large to import.')).toBeVisible()
    expect(hook.mutate).not.toHaveBeenCalled()
  })
})
