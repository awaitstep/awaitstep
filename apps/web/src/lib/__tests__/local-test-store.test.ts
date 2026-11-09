import { beforeEach, describe, expect, it } from 'vitest'
import { useLocalTestStore } from '../../stores/local-test-store'

beforeEach(() => {
  useLocalTestStore.setState({
    open: false,
    mode: 'canvas',
    workflowId: null,
    triggerInput: '{}',
  })
})

describe('local test view state', () => {
  it('opens in the surface that started it and remembers the payload', () => {
    useLocalTestStore.getState().openFor('wf-1', 'ide')
    useLocalTestStore.getState().setTriggerInput('{"orderId":"1"}')
    expect(useLocalTestStore.getState()).toMatchObject({
      open: true,
      mode: 'ide',
      workflowId: 'wf-1',
      triggerInput: '{"orderId":"1"}',
    })
  })

  it('closing hides the panel without clearing the payload', () => {
    useLocalTestStore.getState().openFor('wf-1', 'canvas')
    useLocalTestStore.getState().setTriggerInput('{"x":1}')
    useLocalTestStore.getState().close()
    expect(useLocalTestStore.getState()).toMatchObject({
      open: false,
      mode: 'canvas',
      workflowId: 'wf-1',
      triggerInput: '{"x":1}',
    })
  })
})
