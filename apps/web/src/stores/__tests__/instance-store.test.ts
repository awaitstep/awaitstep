import { beforeEach, describe, expect, it } from 'vitest'
import { useInstanceStore } from '../instance-store'

describe('useInstanceStore', () => {
  beforeEach(() => useInstanceStore.setState({ features: [], disabled: [] }))

  it('starts with no features and nothing switched off', () => {
    expect(useInstanceStore.getState().features).toEqual([])
    expect(useInstanceStore.getState().disabled).toEqual([])
  })

  it('keeps the same lists when handed equal ones, so subscribers do not re-render', () => {
    const { setInstance } = useInstanceStore.getState()
    setInstance({ features: ['a', 'b'], disabled: ['playground'] })
    const first = useInstanceStore.getState()
    setInstance({ features: ['a', 'b'], disabled: ['playground'] })
    expect(useInstanceStore.getState().features).toBe(first.features)
    expect(useInstanceStore.getState().disabled).toBe(first.disabled)
  })

  it('replaces only the list that changed', () => {
    const { setInstance } = useInstanceStore.getState()
    setInstance({ features: ['a'], disabled: ['playground'] })
    const features = useInstanceStore.getState().features
    setInstance({ features: ['a'], disabled: ['playground', 'connections.ui'] })
    expect(useInstanceStore.getState().features).toBe(features)
    expect(useInstanceStore.getState().disabled).toEqual(['playground', 'connections.ui'])
    setInstance({ features: [], disabled: ['playground', 'connections.ui'] })
    expect(useInstanceStore.getState().features).toEqual([])
  })
})
