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

  it('keeps the name and description a created workflow was given', async () => {
    const store = useWorkflowStore.getState()
    store.setWorkflowId('wf_1')
    useWorkflowStore.setState({
      metadata: { ...store.metadata, name: 'Lead scoring', description: 'Scores leads' },
    })
    render(<TemplatePicker onDismiss={vi.fn()} />)
    const template = workflowTemplates[0]!
    await userEvent.click(screen.getByRole('button', { name: new RegExp(template.name) }))
    const { metadata, nodes } = useWorkflowStore.getState()
    expect(metadata.name).toBe('Lead scoring')
    expect(metadata.description).toBe('Scores leads')
    expect(nodes).toHaveLength(template.ir.nodes.length)
  })

  it('takes the template’s name on a workflow not saved yet', async () => {
    useWorkflowStore.getState().setWorkflowId('new')
    render(<TemplatePicker onDismiss={vi.fn()} />)
    const template = workflowTemplates[0]!
    await userEvent.click(screen.getByRole('button', { name: new RegExp(template.name) }))
    expect(useWorkflowStore.getState().metadata.name).toBe(template.ir.metadata.name)
  })

  it('changes nothing when starting from scratch', async () => {
    render(<TemplatePicker onDismiss={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Start from scratch/ }))
    expect(useWorkflowStore.getState().isDirty).toBe(false)
    expect(useWorkflowStore.getState().nodes).toHaveLength(0)
  })
})
