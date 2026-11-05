import { beforeEach, describe, expect, it } from 'vitest'
import { useIdeStore } from '../../stores/ide-store'

const store = () => useIdeStore.getState()

beforeEach(() => {
  store().resetSession()
  store().openFile('a.ts')
  store().openFile('b.ts')
})

describe('requestClose', () => {
  it('closes clean tabs straight away', () => {
    store().requestClose(['b.ts'])
    expect(store().openPaths).toEqual(['a.ts'])
    expect(store().closeRequest).toBeNull()
  })

  it('holds a dirty tab open and files a request instead', () => {
    store().setDraft('b.ts', 'edited', 'h')
    store().requestClose(['b.ts'])
    expect(store().openPaths).toEqual(['a.ts', 'b.ts'])
    expect(store().closeRequest).toEqual({ paths: ['b.ts'], dirty: ['b.ts'] })
  })

  it('asks once for close all, listing only the dirty tabs', () => {
    store().setDraft('a.ts', 'x', 'h')
    store().setDraft('b.ts', 'y', 'h')
    store().requestClose(store().openPaths)
    expect(store().closeRequest?.dirty).toEqual(['a.ts', 'b.ts'])
  })

  it('keeps the tab and the draft on cancel', () => {
    store().setDraft('b.ts', 'edited', 'h')
    store().requestClose(['b.ts'])
    store().cancelClose()
    expect(store().closeRequest).toBeNull()
    expect(store().openPaths).toContain('b.ts')
    expect(store().drafts['b.ts']).toBeDefined()
  })
})
