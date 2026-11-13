import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkflowNode } from '@awaitstep/ir'
import { TemplateExecution, templateExecutionLine } from '../template-execution'

function node(data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: 'route',
    type: 'custom:lead',
    name: 'Route lead',
    position: { x: 0, y: 0 },
    version: '1.0.1',
    provider: 'cloudflare',
    data,
  }
}

describe('TemplateExecution', () => {
  it('runs durable by default, with the retries and timeout from node.json', () => {
    render(
      <TemplateExecution
        node={node()}
        runtime={{ defaultRetries: 3, defaultTimeout: '30 seconds' }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('switch', { name: 'Inline — no step' })).not.toBeChecked()
    expect(
      screen.getByText('Runs as a step: retries 3 · timeout 30 seconds, from node.json.'),
    ).toBeInTheDocument()
  })

  it('says a config saved on the node, which wins over node.json, is the node’s own', () => {
    // Before, it read "from node.json" while the code used the node's config.
    render(
      <TemplateExecution
        node={{ ...node(), config: { retries: { limit: 7, delay: '1 second' } } }}
        runtime={{ defaultRetries: 3 }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Runs as a step: retries 7, set on this node.')).toBeInTheDocument()
  })

  it('says the runtime defaults apply when node.json declares none', () => {
    render(<TemplateExecution node={node()} runtime={undefined} onChange={vi.fn()} />)
    expect(
      screen.getByText('Runs as a step with the runtime’s default retries.'),
    ).toBeInTheDocument()
  })

  it('turns Inline on, and off again by clearing the field', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <TemplateExecution node={node()} runtime={undefined} onChange={onChange} />,
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    expect(onChange).toHaveBeenLastCalledWith('inline', true)
    rerender(
      <TemplateExecution node={node({ inline: true })} runtime={undefined} onChange={onChange} />,
    )
    expect(screen.queryByText(/Runs as a step/)).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Inline — no step' }))
    expect(onChange).toHaveBeenLastCalledWith('inline', undefined)
  })

  it('words a config', () => {
    expect(templateExecutionLine(undefined)).toBe('Runtime defaults')
    expect(templateExecutionLine({ retries: { limit: 2, delay: '5 seconds' } })).toBe('retries 2')
  })
})
