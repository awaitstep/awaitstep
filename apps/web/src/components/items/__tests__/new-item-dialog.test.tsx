import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiError,
  installFakeApi,
  renderWithDashboardApi,
  type FakeApi,
} from '../../../__tests__/fake-api'
import { createdWorkflow } from '../../../__tests__/fixtures/api/workflows'
import type { ItemKind } from '../../../types/dashboard/items'
import { NewItemDialog, type ItemStart } from '../new-item-dialog'
import { useNewItem } from '../use-new-item'

const goTo = vi.fn()
vi.mock('../../navigation/router-shell-link', () => ({ useGoTo: () => goTo }))

const sales = { org: 'acme', project: 'project-101', workspace: 'sales' }
const EDITOR = /^\/acme\/project-101\/sales\/workflows\/[^/?]+$/
const EDITOR_ON_TEMPLATES = /^\/acme\/project-101\/sales\/workflows\/[^/?]+\?template=1$/

beforeEach(() => {
  goTo.mockReset()
})

function NewButton({ kind, start }: { kind: ItemKind; start?: ItemStart }) {
  const newItem = useNewItem()
  function handleClick() {
    newItem.start(kind, start)
  }
  return (
    <>
      <button onClick={handleClick}>Open</button>
      {newItem.dialog && <NewItemDialog slugs={sales} {...newItem.dialog} />}
    </>
  )
}

async function open(kind: ItemKind = 'workflow', start?: ItemStart, api?: FakeApi) {
  const view = renderWithDashboardApi(<NewButton kind={kind} start={start} />, {
    api: api ?? installFakeApi(),
  })
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))
  return view
}

describe('New workflow / New function', () => {
  it('creates nothing until it has a name, and nothing on Cancel', async () => {
    const { api } = await open()
    expect(screen.getByRole('dialog', { name: 'New workflow' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create workflow' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), '   ')
    expect(screen.getByRole('button', { name: 'Create workflow' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.requestsTo('POST /workflows')).toHaveLength(0)
  })

  it('creates it with its name and description, then opens it on the template picker', async () => {
    const { api } = await open()
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), '  Lead enrichment ')
    await userEvent.type(screen.getByRole('textbox', { name: /Description/ }), 'Adds company data')
    await userEvent.click(screen.getByRole('button', { name: 'Create workflow' }))
    await waitFor(() =>
      expect(goTo).toHaveBeenCalledWith(expect.stringMatching(EDITOR_ON_TEMPLATES)),
    )
    expect(api.lastRequest('POST /workflows').body).toEqual({
      kind: 'workflow',
      name: 'Lead enrichment',
      description: 'Adds company data',
    })
  })

  it('opens on an empty canvas when Blank is picked', async () => {
    await open()
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'Weekly report')
    await userEvent.click(screen.getByRole('radio', { name: /Blank/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create workflow' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(expect.stringMatching(EDITOR)))
  })

  it('starts on Blank when opened from Start from blank', async () => {
    await open('workflow', 'blank')
    expect(screen.getByRole('radio', { name: /Blank/ })).toBeChecked()
  })

  it('asks a function only for its name and description: it has no templates', async () => {
    await open('script')
    expect(screen.getByRole('dialog', { name: 'New function' })).toBeVisible()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'CRM sync')
    await userEvent.click(screen.getByRole('button', { name: 'Create function' }))
    await waitFor(() => expect(goTo).toHaveBeenCalledWith(expect.stringMatching(EDITOR)))
  })

  it('says why the create was refused, in the dialog', async () => {
    const api = installFakeApi()
    api.on('POST /workflows', apiError(403, 'You can only view this workspace'))
    await open('workflow', undefined, api)
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'Lead enrichment')
    await userEvent.click(screen.getByRole('button', { name: 'Create workflow' }))
    expect(await screen.findByText('You can only view this workspace')).toBeVisible()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('says a server failure in general words, not its raw text', async () => {
    const api = installFakeApi()
    api.on('POST /workflows', apiError(500, 'pg: relation "workflows" lock timeout'))
    await open('script', undefined, api)
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'CRM sync')
    await userEvent.click(screen.getByRole('button', { name: 'Create function' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t create the function')
    expect(screen.queryByText(/lock timeout/)).not.toBeInTheDocument()
  })

  it('locks the form while the create is on its way, so typing can’t make a second item', async () => {
    const api = installFakeApi()
    api.hang('POST /workflows')
    await open('workflow', undefined, api)
    const name = screen.getByRole('textbox', { name: /Name/ })
    await userEvent.type(name, 'Lead enrichment')
    await userEvent.click(screen.getByRole('button', { name: 'Create workflow' }))
    await waitFor(() => expect(name).toBeDisabled())
    await userEvent.type(name, 'x')
    expect(screen.getByRole('radio', { name: /Blank/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create workflow' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(api.requestsTo('POST /workflows')).toHaveLength(1)
  })

  it('still opens the editor when the dialog is gone before the create answers', async () => {
    // An empty state ends as the lists refetch, taking its dialog with it.
    let answer!: () => void
    const api = installFakeApi()
    api.on(
      'POST /workflows',
      (req) =>
        new Promise((resolve) => {
          answer = () => resolve(createdWorkflow('ws_sales', req.body as { name: string }, api.now))
        }),
    )
    const view = await open('workflow', undefined, api)
    await userEvent.type(screen.getByRole('textbox', { name: /Name/ }), 'Lead enrichment')
    await userEvent.click(screen.getByRole('button', { name: 'Create workflow' }))
    await waitFor(() => expect(answer).toBeDefined())
    view.unmount()
    await act(async () => answer())
    await waitFor(() =>
      expect(goTo).toHaveBeenCalledWith(expect.stringMatching(EDITOR_ON_TEMPLATES)),
    )
  })
})
