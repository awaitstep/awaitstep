import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'
import { useSwitchView } from '../use-switch-view'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

afterEach(() => navigate.mockReset())

const slugs = { org: 'acme', project: 'core', workspace: 'sales' }
function wrapper({ children }: { children: ReactNode }) {
  return <EditorScopeProvider value={slugs}>{children}</EditorScopeProvider>
}

describe('useSwitchView', () => {
  it('stays on the workflow’s workspace URL', () => {
    const { result } = renderHook(() => useSwitchView('wf_1'), { wrapper })
    void result.current('ide', { version: 'v-2' })
    expect(navigate).toHaveBeenCalledWith({
      to: '/$org/$project/$workspace/workflows/$id',
      params: { ...slugs, id: 'wf_1' },
      search: { view: 'ide', version: 'v-2' },
      replace: true,
    })
  })

  it('is only used under a workspace URL', () => {
    expect(() => renderHook(() => useSwitchView('wf_1'))).toThrow(/outside its workspace URL/)
  })

  it('passes the node to open on the canvas', () => {
    const { result } = renderHook(() => useSwitchView('wf_1'), { wrapper })
    void result.current('canvas', { version: 'v-3', node: 'n9' })
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { view: 'canvas', version: 'v-3', node: 'n9' } }),
    )
  })
})
