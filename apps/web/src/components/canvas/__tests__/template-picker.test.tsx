import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workflowTemplates } from '../../../lib/workflow-templates'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { TemplatePicker } from '../template-picker'

beforeEach(() => useWorkflowStore.getState().reset())

describe('TemplatePicker', () => {
  it('leaves a picked template unsaved, so it auto-saves and is not lost on leaving', async () => {
    const onDismiss = vi.fn()
    render(<TemplatePicker onDismiss={onDismiss} />)
    const template = workflowTemplates[0]!
    await userEvent.click(screen.getByRole('button', { name: new RegExp(template.name) }))
    expect(useWorkflowStore.getState().nodes).toHaveLength(template.ir.nodes.length)
    expect(useWorkflowStore.getState().isDirty).toBe(true)
    expect(onDismiss).toHaveBeenCalled()
  })

  it('changes nothing when starting from scratch', async () => {
    render(<TemplatePicker onDismiss={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Start from scratch/ }))
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })
})
