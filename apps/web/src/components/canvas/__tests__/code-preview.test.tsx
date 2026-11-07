import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodePreview } from '../code-preview'

const entry = vi.hoisted(() => ({
  current: {
    path: 'awaitstep/workflow.ts' as string | null,
    source: 'export default defineWorkflow({});\n' as string | null,
    error: null as string | null,
  },
}))

const copyToClipboard = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

let lastEditorProps: Record<string, unknown> = {}

vi.mock('../../../hooks/use-generated-entry', () => ({
  useGeneratedEntry: () => entry.current,
}))
vi.mock('../../../lib/monaco/theme', () => ({ useMonacoTheme: () => 'vs-dark' }))
vi.mock('../../../lib/utils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  copyToClipboard,
}))
vi.mock('../../../lib/action-toast', () => ({ actionToast: toast }))
vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    lastEditorProps = props
    return (
      <div
        data-testid="monaco"
        data-value={String(props.value ?? '')}
        data-path={String(props.path ?? '')}
        data-readonly={String((props.options as { readOnly?: boolean })?.readOnly ?? false)}
      />
    )
  },
}))

beforeEach(() => {
  entry.current = {
    path: 'awaitstep/workflow.ts',
    source: 'export default defineWorkflow({});\n',
    error: null,
  }
  copyToClipboard.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('CodePreview', () => {
  it('shows the generated module read-only, with its own model', async () => {
    render(<CodePreview onClose={vi.fn()} />)
    expect(await screen.findByTestId('monaco')).toHaveAttribute('data-readonly', 'true')
    expect(screen.getByText('awaitstep/workflow.ts')).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(lastEditorProps).toMatchObject({
      path: 'inmemory://code-preview/awaitstep%2Fworkflow.ts',
      value: entry.current.source,
    })
  })

  it('copies the generated code', async () => {
    render(<CodePreview onClose={vi.fn()} />)
    await screen.findByTestId('monaco')
    await userEvent.click(screen.getByRole('button', { name: /Copy/ }))
    expect(copyToClipboard).toHaveBeenCalledWith(entry.current.source)
    expect(toast.success).toHaveBeenCalledWith('Code copied')
  })

  it('closes from its header', async () => {
    const onClose = vi.fn()
    render(<CodePreview onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Hide code preview' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says why there is no code when generation fails', () => {
    entry.current = { path: 'awaitstep/workflow.ts', source: null, error: 'Cycle in the graph' }
    render(<CodePreview onClose={vi.fn()} />)
    expect(screen.getByText('Couldn’t generate code')).toBeInTheDocument()
    expect(screen.getByText('Cycle in the graph')).toBeInTheDocument()
    expect(screen.queryByTestId('monaco')).toBeNull()
  })

  it('asks for a step before there is anything to generate', () => {
    entry.current = { path: null, source: null, error: null }
    render(<CodePreview onClose={vi.fn()} />)
    expect(screen.getByText('Nothing to preview yet')).toBeInTheDocument()
    expect(screen.queryByTestId('monaco')).toBeNull()
  })
})
