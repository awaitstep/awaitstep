import { beforeEach, describe, expect, it } from 'vitest'
import { useInstanceStore } from '../instance-store'

describe('useInstanceStore', () => {
  beforeEach(() => useInstanceStore.setState({ features: [] }))

  it('starts with no features', () => {
    expect(useInstanceStore.getState().features).toEqual([])
  })

  it('keeps the same list when handed equal features, so subscribers do not re-render', () => {
    useInstanceStore.getState().setFeatures(['a', 'b'])
    const first = useInstanceStore.getState().features
    useInstanceStore.getState().setFeatures(['a', 'b'])
    expect(useInstanceStore.getState().features).toBe(first)
    useInstanceStore.getState().setFeatures(['a'])
    expect(useInstanceStore.getState().features).toEqual(['a'])
  })
})
