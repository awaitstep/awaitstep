// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeDockTab, useIdeLayoutStore } from '../ide-layout-store'

describe('normalizeDockTab', () => {
  it('opens Test session for the old Run and Output tabs', () => {
    expect(normalizeDockTab('run')).toBe('session')
    expect(normalizeDockTab('output')).toBe('session')
  })

  it('keeps the tabs that still exist', () => {
    for (const tab of ['problems', 'session', 'quickTest'] as const) {
      expect(normalizeDockTab(tab)).toBe(tab)
    }
  })

  it('falls back to Problems for anything unknown', () => {
    expect(normalizeDockTab('nope')).toBe('problems')
    expect(normalizeDockTab(undefined)).toBe('problems')
    expect(normalizeDockTab(3)).toBe('problems')
  })
})

describe('layout store rehydration', () => {
  beforeEach(() => localStorage.clear())

  it.each(['run', 'output'])(
    'a stored dockTab of %s opens Test session without throwing',
    async (old) => {
      localStorage.setItem(
        'awaitstep-ide',
        JSON.stringify({
          state: { dockTab: old, dockOpen: false, explorerOpen: false },
          version: 0,
        }),
      )
      await useIdeLayoutStore.persist.rehydrate()
      expect(useIdeLayoutStore.getState()).toMatchObject({
        dockTab: 'session',
        dockOpen: false,
        explorerOpen: false,
      })
    },
  )

  it('uses defaults when nothing is stored', async () => {
    await useIdeLayoutStore.persist.rehydrate()
    expect(useIdeLayoutStore.getState().dockTab).toBe('problems')
  })

  it('keeps the remembered Search view and still normalises an old dock tab', async () => {
    localStorage.setItem(
      'awaitstep-ide',
      JSON.stringify({ state: { dockTab: 'run', sideBarTab: 'search' }, version: 0 }),
    )
    await useIdeLayoutStore.persist.rehydrate()
    expect(useIdeLayoutStore.getState()).toMatchObject({
      dockTab: 'session',
      sideBarTab: 'search',
    })
  })

  it('falls back to Files for an unknown stored side bar view', async () => {
    localStorage.setItem(
      'awaitstep-ide',
      JSON.stringify({ state: { sideBarTab: 'git' }, version: 0 }),
    )
    await useIdeLayoutStore.persist.rehydrate()
    expect(useIdeLayoutStore.getState().sideBarTab).toBe('explorer')
  })

  it('showSideBar opens a hidden side bar without touching the dock tab', () => {
    useIdeLayoutStore.setState({ explorerOpen: false, dockTab: 'session' })
    useIdeLayoutStore.getState().showSideBar('search')
    expect(useIdeLayoutStore.getState()).toMatchObject({
      explorerOpen: true,
      sideBarTab: 'search',
      dockTab: 'session',
    })
  })
})
