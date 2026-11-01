import { describe, expect, it } from 'vitest'
import { ACME_CRM, ANTHROPIC, RESEND, SLACK } from '../parts/__tests__/fixtures/nodes'
import { categoryOptions, filterNodes, nodeCategories, showCounts } from '../node-filter'

const NODES = [ACME_CRM, SLACK, RESEND, ANTHROPIC]
const ALL = { show: 'all', category: 'All', search: '' } as const

const names = (list: { name: string }[] | null) => list?.map((n) => n.name) ?? null

describe('node filter', () => {
  it('counts the whole catalog for the Show pills', () => {
    expect(showCounts(NODES)).toEqual({ all: 4, installed: 3, available: 1 })
  })

  it('splits installed from available', () => {
    const { installed, available } = filterNodes(NODES, ALL)
    expect(names(installed)).toEqual(['Acme CRM lookup', 'Slack', 'Resend'])
    expect(names(available)).toEqual(['Anthropic'])
  })

  it('hides the section the Show pill leaves out', () => {
    expect(filterNodes(NODES, { ...ALL, show: 'installed' }).available).toBeNull()
    expect(filterNodes(NODES, { ...ALL, show: 'available' }).installed).toBeNull()
  })

  it('narrows by category and by name, ignoring case and spaces', () => {
    expect(names(filterNodes(NODES, { ...ALL, category: 'Messaging' }).installed)).toEqual([
      'Slack',
      'Resend',
    ])
    const found = filterNodes(NODES, { ...ALL, search: '  SLA ' })
    expect(names(found.installed)).toEqual(['Slack'])
    expect(names(found.available)).toEqual([])
  })

  it('offers the categories the catalog has, A to Z, each once', () => {
    expect(nodeCategories(NODES)).toEqual(
      [...new Set(NODES.map((n) => n.category))].sort((a, b) => a.localeCompare(b)),
    )
    expect(nodeCategories([{ ...SLACK, category: 'CRM' }, SLACK, ANTHROPIC])).toEqual([
      'AI',
      'CRM',
      'Messaging',
    ])
  })

  it('gives the Category select All first, then each category A to Z with its count', () => {
    const options = categoryOptions(NODES)
    expect(options[0]).toEqual({ value: 'All', label: 'All', count: 4 })
    expect(options.slice(1).map((o) => o.value)).toEqual(nodeCategories(NODES))
    expect(options.slice(1).reduce((sum, o) => sum + o.count, 0)).toBe(4)
  })
})
