import { describe, expect, it } from 'vitest'
import { useInstanceStore } from '../../../stores/instance-store'
import { runCurl, runEndpoint } from '../run-endpoint'

describe('runEndpoint', () => {
  it('is the API’s run route at the dashboard’s origin', () => {
    expect(runEndpoint('wf-1', 'https://app.example.com')).toBe(
      'https://app.example.com/api/run/wf-1',
    )
  })

  it('is the path alone where there is no page to take an origin from', () => {
    expect(runEndpoint('wf-1')).toBe('/api/run/wf-1')
  })

  it('is the instance’s own run address when it names one', () => {
    const instance = { features: [], disabled: [] }
    useInstanceStore.getState().setInstance({ ...instance, runUrl: 'https://run.example.com/run' })
    try {
      expect(runEndpoint('wf 1')).toBe('https://run.example.com/run/wf%201')
      expect(runCurl('wf-1')).toContain("'https://run.example.com/run/wf-1'")
      // An origin asked for by name still wins.
      expect(runEndpoint('wf-1', 'https://app.example.com')).toBe(
        'https://app.example.com/api/run/wf-1',
      )
    } finally {
      useInstanceStore.getState().setInstance(instance)
    }
    expect(runEndpoint('wf-1')).toBe('/api/run/wf-1')
  })
})

describe('runCurl', () => {
  const origin = 'https://app.example.com'

  it('runs it with a key placeholder and an empty JSON body', () => {
    expect(runCurl('wf-1', { origin })).toBe(
      `curl -X POST 'https://app.example.com/api/run/wf-1' -H 'Authorization: Bearer <your key>' -H 'content-type: application/json' -d '{}'`,
    )
  })

  it('names the account when one is given', () => {
    expect(runCurl('wf-1', { origin, account: 'conn 1' })).toContain(
      `'https://app.example.com/api/run/wf-1?account=conn%201'`,
    )
  })

  it('quotes the body for a shell, single quotes included', () => {
    expect(runCurl('wf-1', { origin, body: `{"name":"O'Brien"}` })).toContain(
      `-d '{"name":"O'\\''Brien"}'`,
    )
  })
})
