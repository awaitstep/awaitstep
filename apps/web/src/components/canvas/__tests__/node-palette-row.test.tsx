import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { NodeDefinition } from '@awaitstep/ir'
import { PaletteRow } from '../node-palette-row'

const def = (id: string, name: string) =>
  ({ id, name, description: `${name} does things`, category: 'Utilities' }) as NodeDefinition

describe('PaletteRow', () => {
  it('shows a workspace custom node’s version and no chip', () => {
    render(
      <PaletteRow
        definition={def('custom:lead', 'Lead router')}
        source={{ itemId: 'lead', owner: 'workspace', version: '1.0.1' }}
        builtin={false}
        onAdd={vi.fn()}
      />,
    )
    expect(screen.getByText('v1.0.1')).toBeInTheDocument()
    expect(screen.queryByText('Project')).toBeNull()
    expect(screen.queryByText('Marketplace')).toBeNull()
  })

  it('tags a project custom node with Project', () => {
    render(
      <PaletteRow
        definition={def('custom:crm', 'Acme CRM')}
        source={{ itemId: 'crm', owner: 'project', version: '1.2.0' }}
        builtin={false}
        onAdd={vi.fn()}
      />,
    )
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('marks a marketplace node Marketplace, and a builtin with nothing', () => {
    const { rerender } = render(
      <PaletteRow
        definition={def('stripe', 'Stripe')}
        source={undefined}
        builtin={false}
        onAdd={vi.fn()}
      />,
    )
    expect(screen.getByText('Marketplace')).toBeInTheDocument()
    expect(screen.queryByText('Custom')).toBeNull()
    rerender(
      <PaletteRow definition={def('step', 'Step')} source={undefined} builtin onAdd={vi.fn()} />,
    )
    expect(screen.queryByText('Marketplace')).toBeNull()
  })

  it('adds its node type on click', async () => {
    const onAdd = vi.fn()
    render(
      <PaletteRow
        definition={def('custom:lead', 'Lead router')}
        source={{ itemId: 'lead', owner: 'workspace', version: '1.0.1' }}
        builtin={false}
        onAdd={onAdd}
      />,
    )
    await userEvent.click(screen.getByText('Lead router'))
    expect(onAdd).toHaveBeenCalledWith('custom:lead')
  })
})
