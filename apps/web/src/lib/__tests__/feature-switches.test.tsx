import type { AnyRouteMatch } from '@tanstack/react-router'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { pageHead } from '../../components/navigation/dashboard-page'
import { useInstanceStore } from '../../stores/instance-store'
import { disabledIn, useDisabledFeatures, useFeatureOn } from '../feature-switches'

function matches(authedData: unknown): AnyRouteMatch[] {
  return [
    { routeId: '__root__', loaderData: undefined },
    { routeId: '/_authed', loaderData: authedData },
    { routeId: '/_authed/_orgless/api-playground', loaderData: undefined },
  ] as unknown as AnyRouteMatch[]
}

beforeEach(() => useInstanceStore.setState({ features: [], disabled: [] }))

describe('disabledIn', () => {
  it('reads what the instance switches off from the signed-in layout’s loader data', () => {
    expect(disabledIn(matches({ features: [], disabled: ['playground'] }))).toEqual(['playground'])
  })

  it('reads nothing switched off before the layout has loaded, or with no layout match', () => {
    expect(disabledIn(matches(undefined))).toEqual([])
    expect(disabledIn([])).toEqual([])
  })

  it('titles a route’s page as not found when its feature is switched off', () => {
    const off = matches({ disabled: ['playground'] })
    expect(pageHead({ kind: 'playground' }, disabledIn(off)).meta[0]!.title).toBe(
      'Page not found · AwaitStep',
    )
    expect(pageHead({ kind: 'org', page: 'connections' }, disabledIn(off)).meta[0]!.title).toBe(
      'Connections · AwaitStep',
    )
  })
})

describe('useFeatureOn', () => {
  it('follows the store: on until the instance switches the feature off', () => {
    const { result } = renderHook(() => useFeatureOn('connections.ui'))
    expect(result.current).toBe(true)
    act(() => useInstanceStore.setState({ disabled: ['connections.ui'] }))
    expect(result.current).toBe(false)
  })

  it('leaves other features on', () => {
    useInstanceStore.setState({ disabled: ['connections.ui'] })
    expect(renderHook(() => useFeatureOn('playground')).result.current).toBe(true)
    expect(renderHook(() => useDisabledFeatures()).result.current).toEqual(['connections.ui'])
  })
})
