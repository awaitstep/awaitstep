import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveVersionFirst } from '../save-version-first'

const switchView = vi.fn()
vi.mock('../../../hooks/use-switch-view', () => ({ useSwitchView: () => switchView }))

beforeEach(() => switchView.mockReset())

describe('SaveVersionFirst', () => {
  it('says what to do and why this part needs it, in two short lines', () => {
    render(<SaveVersionFirst workflowId="wf" reason="Steps come from a saved version." />)
    expect(screen.getByText('Save a version on the canvas first')).toBeInTheDocument()
    expect(screen.getByText('Steps come from a saved version.')).toBeInTheDocument()
  })

  it('opens the canvas of that workflow from its button', async () => {
    render(<SaveVersionFirst workflowId="wf" reason="x" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open canvas' }))
    expect(switchView).toHaveBeenCalledWith('canvas')
  })
})
