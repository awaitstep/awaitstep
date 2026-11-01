import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VariableDialog } from '../variable-dialog'
import {
  orgVariableTarget,
  projectVariableTarget,
  workspaceVariableTarget,
} from '../variable-targets'

describe('variable targets', () => {
  it('names the level a variable is saved at', () => {
    expect(orgVariableTarget('Acme Inc').scope).toEqual({ level: 'organization' })
    expect(projectVariableTarget({ slug: 'p', name: 'Project 101' }).scope).toEqual({
      level: 'project',
      project: 'p',
    })
    expect(workspaceVariableTarget({ slug: 'p' }, { slug: 'sales', name: 'Sales' }).scope).toEqual({
      level: 'workspace',
      project: 'p',
      workspace: 'sales',
    })
  })
})

const PLACES = {
  noun: 'workspace' as const,
  options: [
    { id: 'ws-sales', slug: 'sales', name: 'Sales' },
    { id: 'ws-ops', slug: 'ops', name: 'Ops' },
  ],
}

function Dialog(props: Partial<React.ComponentProps<typeof VariableDialog>>) {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <VariableDialog
        org="acme"
        mode={{ kind: 'new' }}
        target={projectVariableTarget({ slug: 'p', name: 'Project 101' })}
        places={PLACES}
        onClose={() => {}}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('VariableDialog without its level known', () => {
  it('cannot save until the page’s level is known', () => {
    render(<Dialog target={null} />)
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeDisabled()
  })
})

describe('VariableDialog "Applies to"', () => {
  it('offers every workspace or specific ones, and needs a ticked workspace for the second', async () => {
    render(<Dialog />)
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'SK_API')
    await userEvent.type(screen.getByLabelText('Value'), 'x')
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeEnabled()
    await userEvent.click(screen.getByRole('radio', { name: /Specific workspaces/ }))
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sales' }))
    expect(screen.getByRole('button', { name: 'Add variable' })).toBeEnabled()
  })

  it('has nothing to choose at a workspace', () => {
    render(
      <Dialog
        places={undefined}
        target={workspaceVariableTarget({ slug: 'p' }, { slug: 'sales', name: 'Sales' })}
      />,
    )
    expect(screen.queryByText('Applies to')).toBeNull()
  })

  it('edits keep reached workspaces ticked and fixed, and block ones with their own value', async () => {
    render(
      <Dialog
        mode={{
          kind: 'edit',
          id: 'v1',
          name: 'SK_API',
          value: 'x',
          isSecret: false,
          reach: {
            all: false,
            places: [{ id: 'ws-sales', slug: 'sales', name: 'Sales' }],
            blocked: ['ws-ops'],
          },
        }}
      />,
    )
    const sales = screen.getByRole('checkbox', { name: /Sales/ })
    expect(sales).toBeChecked()
    expect(sales).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Ops/ })).toBeDisabled()
  })

  it('has no picker when overriding an inherited value', () => {
    render(<Dialog mode={{ kind: 'override', name: 'REGION', isSecret: false }} />)
    expect(screen.queryByText('Applies to')).toBeNull()
  })

  it('shows no picker once the variable applies everywhere', () => {
    render(
      <Dialog
        mode={{
          kind: 'edit',
          id: 'v1',
          name: 'SK_API',
          value: 'x',
          isSecret: false,
          reach: { all: true, places: [], blocked: [] },
        }}
      />,
    )
    expect(screen.queryByText('Applies to')).toBeNull()
  })
})
