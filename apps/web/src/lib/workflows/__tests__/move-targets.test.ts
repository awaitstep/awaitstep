import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../../types/dashboard/workspaces'
import { moveTargets } from '../move-targets'

const ws = (slug: string, viewerCanEdit: boolean) => ({ slug, viewerCanEdit }) as Workspace

describe('moveTargets', () => {
  it('keeps the other workspaces you can build in', () => {
    const all = [ws('sales', true), ws('finance', false), ws('ops', true)]
    expect(moveTargets(all, 'sales').map((w) => w.slug)).toEqual(['ops'])
  })
})
