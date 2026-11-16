import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { templateCategories, workflowTemplates } from '../../../lib/workflow-templates'
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

  it('shows one tab per section with its count, and only the open section’s cards', async () => {
    render(<TemplatePicker onDismiss={vi.fn()} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(templateCategories.length)
    for (const [i, category] of templateCategories.entries()) {
      const count = workflowTemplates.filter((t) => t.category === category.id).length
      expect(tabs[i]).toHaveTextContent(`${category.name} ${count}`)
    }

    const first = templateCategories[0]!
    const last = templateCategories.at(-1)!
    const firstTemplate = workflowTemplates.find((t) => t.category === first.id)!
    const lastTemplate = workflowTemplates.find((t) => t.category === last.id)!
    expect(screen.getByRole('button', { name: new RegExp(firstTemplate.name) })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: new RegExp(lastTemplate.name) })).toBeNull()

    await userEvent.click(screen.getByRole('tab', { name: new RegExp(last.name) }))
    expect(screen.getByRole('button', { name: new RegExp(lastTemplate.name) })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: new RegExp(firstTemplate.name) })).toBeNull()
  })

  it('names the registry nodes a template needs on its card', () => {
    render(<TemplatePicker onDismiss={vi.fn()} />)
    const card = screen.getByRole('button', { name: /Failed payment recovery/ })
    expect(card).toHaveTextContent('Uses Resend')
  })

  it('has no Hello World template', () => {
    render(<TemplatePicker onDismiss={vi.fn()} />)
    expect(screen.queryByText(/Hello World/)).toBeNull()
  })

  it('closes from the labelled close button and hands focus back to More actions', async () => {
    const onDismiss = vi.fn()
    render(
      <>
        <div data-zone="menu">
          <button type="button">More actions</button>
        </div>
        <TemplatePicker onDismiss={onDismiss} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismiss).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'More actions' })).toHaveFocus()
  })
})
