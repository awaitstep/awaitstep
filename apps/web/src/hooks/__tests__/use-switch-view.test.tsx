import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'
import { useSwitchView } from '../use-switch-view'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

afterEach(() => navigate.mockReset())

describe('useSwitchView', () => {
  it('stays on the workspace URL when the editor was opened there', () => {
    const slugs = { org: 'acme', project: 'core', workspace: 'sales' }
    function wrapper({ children }: { children: ReactNode }) {
      return <EditorScopeProvider value={slugs}>{children}</EditorScopeProvider>
    }
    const { result } = renderHook(() => useSwitchView('wf_1'), { wrapper })
    void result.current('ide', { version: 'v-2' })
    expect(navigate).toHaveBeenCalledWith({
      to: '/$org/$project/$workspace/workflows/$id',
      params: { ...slugs, id: 'wf_1' },
      search: { view: 'ide', version: 'v-2' },
      replace: true,
    })
  })

  it('stays on the old editor route otherwise', () => {
    const { result } = renderHook(() => useSwitchView('wf_1'))
    void result.current('canvas')
    expect(navigate).toHaveBeenCalledWith({
      to: '/workflows/$workflowId/editor',
      params: { workflowId: 'wf_1' },
      search: { view: 'canvas' },
      replace: true,
    })
  })
})
