import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkflowNode } from '@awaitstep/ir'
import { ExportFields } from '../export-fields'

const SCOPE = {
  varName: 'Say_Hello',
  upstream: [],
  bindings: [],
  status: 'ok' as const,
  returned: false,
  exportKey: 'Say_Hello',
}

function node(type: string): WorkflowNode {
  return {
    id: 'hello',
    type,
    name: 'Say Hello',
    position: { x: 0, y: 0 },
    version: '1.0.0',
    provider: 'cloudflare',
    data: { name: 'Frank Test' },
  }
}

describe('Return this value on a custom node', () => {
  it('is offered in a function for a custom or marketplace node, and turns the flag on', async () => {
    const onChange = vi.fn()
    render(
      <ExportFields node={node('custom:abc')} kind="script" scope={SCOPE} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Return this value' }))
    expect(onChange).toHaveBeenCalledWith('export', true)
  })

  it('is absent in a workflow, and for a builtin kind with no value', () => {
    const { rerender } = render(
      <ExportFields node={node('custom:abc')} kind="workflow" scope={SCOPE} onChange={vi.fn()} />,
    )
    expect(screen.queryByRole('switch', { name: 'Return this value' })).toBeNull()
    rerender(<ExportFields node={node('sleep')} kind="script" scope={SCOPE} onChange={vi.fn()} />)
    expect(screen.queryByRole('switch', { name: 'Return this value' })).toBeNull()
  })
})
