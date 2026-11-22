import { describe, expect, it } from 'vitest'
import { OSS_FEATURES, checkDisabledFeatures, isOssFeature } from '../oss-features.js'

describe('switchable OSS features', () => {
  it('names the playground, both connections switches, docs and the landing page', () => {
    expect(Object.keys(OSS_FEATURES)).toEqual([
      'playground',
      'connections.ui',
      'connections.apiTokens',
      'docs',
      'landing',
    ])
  })

  it('knows only the listed names, not inherited object keys', () => {
    expect(isOssFeature('playground')).toBe(true)
    expect(isOssFeature('toString')).toBe(false)
    expect(isOssFeature('connections')).toBe(false)
    expect(isOssFeature(1)).toBe(false)
  })

  it('returns nothing switched off for an empty list', () => {
    expect(checkDisabledFeatures([])).toEqual([])
  })

  it('returns each switched-off feature once, in list order', () => {
    expect(checkDisabledFeatures(['connections.apiTokens', 'playground', 'playground'])).toEqual([
      'playground',
      'connections.apiTokens',
    ])
  })

  it('refuses an unknown name, naming it and the known ones', () => {
    expect(() => checkDisabledFeatures(['playground', 'connection.ui'])).toThrow(
      /Unknown feature switch "connection\.ui"\. Known: playground, connections\.ui, connections\.apiTokens, docs, landing\./,
    )
  })

  it('refuses a name that is not a string', () => {
    expect(() => checkDisabledFeatures([42])).toThrow(/Unknown feature switch "42"/)
  })
})
