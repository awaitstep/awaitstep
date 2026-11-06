import { QueryClientProvider, useMutation } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import {
  ACTION_TOAST_MS,
  actionToast,
  defineToast,
  ERROR_TOAST_MS,
  failureLine,
  runAction,
} from '../action-toast'
import { ApiError, ProjectFileConflictError } from '../api-client'
import { makeQueryClient } from '../query-client'

function setup() {
  const client = makeQueryClient()
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { wrapper: Wrapper }
}

const saved = { success: 'Profile saved', error: 'Couldn’t save your profile' }

beforeEach(() => {
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('mutation toasts', () => {
  it('toasts the success line when a mutation with meta succeeds', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => useMutation({ mutationFn: async () => 'ok', meta: { toast: saved } }),
      { wrapper },
    )
    await act(() => result.current.mutateAsync())
    expect(toast.success).toHaveBeenCalledWith('Profile saved', expect.any(Object))
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('toasts the server’s reason for a refusal', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new ApiError('This invite was sent less than ten minutes ago', 429)
          },
          meta: { toast: saved },
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error).toHaveBeenCalledWith(
      'This invite was sent less than ten minutes ago',
      expect.objectContaining({
        duration: 6000,
      }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('toasts the general line for a server failure', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw new ApiError('Internal server error', 500)
          },
          meta: { toast: saved },
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Couldn’t save your profile',
        expect.objectContaining({ duration: 6000 }),
      ),
    )
  })

  it('stays quiet for a silent mutation', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(
      () => useMutation({ mutationFn: async () => 'ok', meta: { toast: 'silent' } }),
      { wrapper },
    )
    await act(() => result.current.mutateAsync())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('passes the variables and result to message functions', async () => {
    const { wrapper } = setup()
    const messages = defineToast<{ name: string }, { device: string }>({
      success: (vars, data) => `Signed out of ${data.device} for ${vars.name}`,
      error: (vars) => `Couldn’t sign out ${vars.name}`,
    })
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async (_: { name: string }) => ({ device: 'Chrome on macOS' }),
          meta: { toast: messages },
        }),
      { wrapper },
    )
    await act(() => result.current.mutateAsync({ name: 'Ada' }))
    expect(toast.success).toHaveBeenCalledWith(
      'Signed out of Chrome on macOS for Ada',
      expect.any(Object),
    )
  })

  it('still toasts when the caller unmounts before the mutation settles', async () => {
    const { wrapper } = setup()
    let finish: (() => void) | undefined
    const { result, unmount } = renderHook(
      () =>
        useMutation({
          mutationFn: () => new Promise<void>((resolve) => (finish = resolve)),
          meta: { toast: { success: 'Project created', error: 'Couldn’t create the project' } },
        }),
      { wrapper },
    )
    act(() => result.current.mutate())
    await waitFor(() => expect(finish).toBeDefined())
    unmount()
    finish?.()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Project created', expect.any(Object)),
    )
  })
})

describe('an error message that judges the failure itself', () => {
  it('sees the error, and null keeps the toast quiet for a failure the page shows another way', async () => {
    const { wrapper } = setup()
    class Refused extends Error {}
    const meta = {
      success: 'Saved',
      error: (_variables: unknown, error: unknown) =>
        error instanceof Refused ? null : 'Couldn’t save',
    }
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async (fail: 'refused' | 'offline') => {
            throw fail === 'refused' ? new Refused('moved') : new TypeError('Failed to fetch')
          },
          meta: { toast: meta },
        }),
      { wrapper },
    )
    act(() => result.current.mutate('refused'))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(toast.error).not.toHaveBeenCalled()
    act(() => result.current.mutate('offline'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error.mock.calls[0]![0]).toBe('Couldn’t save')
  })
})

describe('a message that cannot break its action', () => {
  it('keeps a mutation successful when its success message throws', async () => {
    const { wrapper } = setup()
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => ({}) as { moved: number[] },
          meta: {
            toast: defineToast<void, { moved: number[] }>({
              success: (_, data) => `${data.moved.length} moved`,
              error: 'Couldn’t move them',
            }),
          },
          onSuccess,
        }),
      { wrapper },
    )
    await act(() => result.current.mutateAsync())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(onSuccess).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('returns runAction’s result when its success message throws', async () => {
    const success = () => {
      throw new Error('bad message')
    }
    await expect(runAction(Promise.resolve(1), { success, error: 'x' })).resolves.toBe(1)
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe('failureLine', () => {
  const general = 'Couldn’t save it'

  it('uses the reason of a refusal', () => {
    expect(failureLine(new ApiError('Name is taken', 409), general)).toBe('Name is taken')
    expect(failureLine(new ProjectFileConflictError('File already exists', null), general)).toBe(
      'File already exists',
    )
    expect(failureLine(Object.assign(new Error('Not found'), { status: 404 }), general)).toBe(
      'Not found',
    )
  })

  it('uses the reason the app threw on purpose', () => {
    expect(failureLine(new Error('No version to export'), general)).toBe('No version to export')
  })

  it('uses the general line for a server failure, a lost connection or a bug', () => {
    expect(failureLine(new ApiError('Internal server error', 500), general)).toBe(general)
    expect(failureLine(new ApiError('Bad gateway', 502), general)).toBe(general)
    expect(failureLine(new TypeError('Failed to fetch'), general)).toBe(general)
    expect(failureLine(new TypeError('Cannot read properties of undefined'), general)).toBe(general)
    expect(failureLine(new SyntaxError('Unexpected token'), general)).toBe(general)
  })

  it('uses the general line when there is no reason at all', () => {
    expect(failureLine(new ApiError('  ', 400), general)).toBe(general)
    expect(failureLine('boom', general)).toBe(general)
    expect(failureLine(null, general)).toBe(general)
  })
})

describe('durations', () => {
  it('follows the board: errors 6 s, a toast with an action 8 s, else the Toaster’s 4 s', () => {
    const action = { label: 'Overwrite', onClick: () => {} }
    actionToast.error('Changed on the server', { action })
    actionToast.error('Couldn’t save it')
    actionToast.success('Added', { action, duration: 3000 })
    actionToast.success('Saved')
    expect(toast.error).toHaveBeenNthCalledWith(
      1,
      'Changed on the server',
      expect.objectContaining({
        action,
        duration: ACTION_TOAST_MS,
      }),
    )
    expect(toast.error).toHaveBeenNthCalledWith(
      2,
      'Couldn’t save it',
      expect.objectContaining({
        duration: ERROR_TOAST_MS,
      }),
    )
    expect(toast.success).toHaveBeenNthCalledWith(
      1,
      'Added',
      expect.objectContaining({ action, duration: 3000 }),
    )
    expect(toast.success.mock.calls[1]?.[1]).not.toHaveProperty('duration')
  })
})

describe('runAction', () => {
  it('toasts success and returns the result', async () => {
    await expect(
      runAction(Promise.resolve(3), { success: 'Signed out', error: 'x' }),
    ).resolves.toBe(3)
    expect(toast.success).toHaveBeenCalledWith('Signed out', expect.any(Object))
  })

  it('toasts the failure and throws the error again', async () => {
    const failure = new TypeError('Failed to fetch')
    await expect(
      runAction(() => Promise.reject(failure), {
        success: 'Signed out',
        error: 'Couldn’t sign you out',
      }),
    ).rejects.toBe(failure)
    expect(toast.error).toHaveBeenCalledWith(
      'Couldn’t sign you out',
      expect.objectContaining({ duration: 6000 }),
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('toasts a refusal’s reason', async () => {
    await expect(
      runAction(Promise.reject(new ApiError('Workflow is locked', 423)), {
        success: 'Triggered',
        error: 'Couldn’t trigger it',
      }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(toast.error).toHaveBeenCalledWith(
      'Workflow is locked',
      expect.objectContaining({ duration: 6000 }),
    )
  })
})
