import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGoTo } from '../router-shell-link'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ Link: () => null, useNavigate: () => navigate }))

describe('useGoTo', () => {
  it('adds a history entry by default', () => {
    const { result } = renderHook(() => useGoTo())
    result.current('/acme/projects?tab=a')
    expect(navigate).toHaveBeenLastCalledWith({
      to: '/acme/projects',
      search: { tab: 'a' },
      hash: undefined,
      replace: undefined,
    })
  })

  it('replaces the current entry when asked, so Back skips a page that is gone', () => {
    const { result } = renderHook(() => useGoTo())
    result.current('/acme/core/sales/workflows', { replace: true })
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: '/acme/core/sales/workflows', replace: true }),
    )
  })
})
