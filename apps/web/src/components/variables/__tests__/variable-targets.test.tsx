import { describe, expect, it } from 'vitest'
import { variableTargets } from '../variable-targets'

describe('variableTargets', () => {
  it('lists the project and workspaces the viewer may change, never the org', () => {
    const targets = variableTargets({
      project: { slug: 'p', name: 'Project 101', canManage: true },
      workspaces: [
        { slug: 'sales', name: 'Sales', canManage: true },
        { slug: 'it', name: 'IT', canManage: false },
      ],
    })
    expect(targets.map((t) => t.label)).toEqual(['Project 101', 'Sales'])
    expect(targets[1]!.scope).toEqual({ level: 'workspace', project: 'p', workspace: 'sales' })
  })
})

describe('VariableDialog without its starting level listed', () => {
  it('waits instead of falling back to a broader level', async () => {
    const { render, screen } = await import('@testing-library/react')
    const { VariableDialog } = await import('../variable-dialog')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <VariableDialog
          org="acme"
          mode={{ kind: 'new' }}
          targets={[
            {
              id: 'org',
              label: 'Acme Inc',
              description: 'Every project',
              kind: 'organization',
              name: 'Acme Inc',
              scope: { level: 'organization' },
            },
          ]}
          startTarget="ws:sales"
          onClose={() => {}}
        />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeDisabled()
  })
})
